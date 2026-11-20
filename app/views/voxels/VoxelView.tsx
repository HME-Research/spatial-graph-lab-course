import { useEffect, useMemo, useState } from 'react';
import { BoxGeometry, EdgesGeometry } from 'three';
import { nodeLabel } from '@app/document';
import { SELECTION_COLOR } from '@core/viewer/appearance';
import type { ViewProps } from '../contracts';
import { DEFAULT_CELL_SIZE, spatialToThree } from '@core/viewer/coordinates';
import { NO_SELECTION } from '@core/viewer/selection';
import { SceneCanvas } from '@core/viewer/three/SceneCanvas';
import { LevelLabels } from '../three/LevelLabels';
import { pickHandlers, type Hover } from '@core/viewer/three/picking';
import { useSpatialScene } from '../three/useSpatialScene';
import { useRemembered } from '../panelMemory';
import { useViewportCamera } from '../viewportCamera';
import type { CameraState } from '@core/viewer/three/viewport';
import { ControlBar, InfoPanel, NAVIGATION_HINT } from '@core/viewer/three/ViewControls';
import { ColorBySelect, Legend } from '../three/SpatialControls';
import { buildNodeItems, cellBounds, framingFor, includeBoxes } from '../three/sceneModel';
import { LevelFilterSelect, useLevelFilter } from '../three/LevelFilterSelect';
import { clipToLevels, hiddenSelectionNote, isCellShown, isLevelShown, levelFilterLabel, levelRange } from '../three/levelFilter';
import { RoomEditGizmo, RoomEditPanel, useRoomEditing } from '../three/editing';
import { useAnalysisOverlay } from '../analysisOverlay';
import { useDefaultOpen, useOverlayWidth } from '../three/overlayWidth';
import { analysisNodeStyle, isAnalysisEdge } from '../presentation/analysis';
import {
  ConnectorCells,
  connectorCells,
  lineOf,
  RelationshipTube,
  tooltipOf,
  useSceneSource,
  useUnitCylinder,
  ViewRelationshipLegend,
} from '../three/v2Scene';

/**
 * Voxels: one semi-transparent box per room (its whole footprint: minimum corner + size in schema
 * v2, one cell in v1), placed with spatialToThree. Colour-by is view-local (type, access group or an
 * attribute); a shown analysis overrides the fill. With the design port the view also shows the
 * cells reserved by generated connectors (pickable: they select their relationship), unresolved
 * relationships as short-dashed red lines, and the snapped move/resize gizmo for the selected room.
 */

/** Gap (metres) kept between neighbouring room boxes so they stay visually separate. */
const GAP = DEFAULT_CELL_SIZE.horizontal * 0.06;
const BASE_OPACITY = 0.38;

export function VoxelView({ selection, onSelect, design, project }: ViewProps) {
  const doc = design.doc;
  const source = useSceneSource(design);
  const s = useSpatialScene(source, selection, project?.attributes, design);
  const camera = useRemembered<CameraState>('camera:voxels');
  const viewportCamera = useViewportCamera();
  const [opacity, setOpacity] = useState(BASE_OPACITY);
  const geo = useVoxelGeometry();
  const tube = useUnitCylinder();
  const analysis = useAnalysisOverlay();

  // Level filter (view state, remembered per panel): rooms clipped to the shown storeys, corridors
  // by their route cells' storey, relationship lines only between shown rooms.
  const [levelFilter, setLevelFilter] = useLevelFilter('voxels', s.levels);
  const range = useMemo(() => levelRange(levelFilter), [levelFilter]);
  const shownNodes = useMemo(() => clipToLevels(source.nodes, range), [source.nodes, range]);
  const nodeItems = useMemo(() => (range === null ? s.nodeItems : buildNodeItems(shownNodes)), [range, s.nodeItems, shownNodes]);
  const shownIds = useMemo(() => new Set(shownNodes.map((n) => n.id)), [shownNodes]);
  const shownBounds = useMemo(() => (range === null ? s.bounds : cellBounds(shownNodes)), [range, s.bounds, shownNodes]);
  const shownLevels = useMemo(() => s.levels.filter((l) => isLevelShown(l, range)), [s.levels, range]);
  const hiddenNote = hiddenSelectionNote(selection, shownIds, levelFilter);
  // A hidden selected room keeps its selection but gets no gizmo (it is not drawn).
  const editing = useRoomEditing(design, hiddenNote ? NO_SELECTION : selection);

  const allConnectors = useMemo(() => connectorCells(design), [design]);
  const connectors = useMemo(() => allConnectors.filter((c) => isCellShown(c.cell, range)), [allConnectors, range]);
  // "Fit view" frames the shown rooms and corridors.
  const framing = useMemo(() => framingFor(includeBoxes(shownBounds, connectors)), [shownBounds, connectors]);
  const unresolved = useMemo(
    () =>
      design
        ? s.edgeItems.filter((e) => design.spatial.byEdge.get(e.id)?.status === 'unresolved' && shownIds.has(e.source) && shownIds.has(e.target))
        : [],
    [design, s.edgeItems, shownIds],
  );
  // A hovered room hidden by the filter must not keep the pointer cursor or info.
  const hovered = s.hovered?.kind === 'node' && !shownIds.has(s.hovered.id) ? null : s.hovered;
  const hoveredEdge = hovered?.kind === 'edge' ? hovered.id : null;
  const editingId = editing.state.phase !== 'idle' ? editing.nodeId : null;
  // Narrow panels (laptop split view): options and legend start folded so the model and the gizmo
  // handles stay visible (audit M1, V05); wide panels show them open.
  const { probe, width, compact } = useOverlayWidth();
  const [legendOpen, setLegendOpen] = useDefaultOpen(compact, width !== null);
  const options = (
    <>
      <ColorBySelect mode={s.colorMode} attributeKeys={s.attributeKeys} metrics={s.metricOptions} onChange={s.setColorMode} />
      <label title="Voxel opacity">
        Opacity{' '}
        <input type="range" min={0.15} max={0.9} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.currentTarget.value))} />
      </label>
    </>
  );

  return (
    <SceneCanvas
      {...viewportCamera}
      ariaLabel="Voxel view"
      framing={framing}
      cameraMemory={camera}
      fitRequest={s.fitRequest}
      grid={s.grid}
      cursor={hovered ? 'pointer' : 'grab'}
      onBackgroundClick={() => onSelect(NO_SELECTION)}
      overlay={
        <>
          {probe}
          <ControlBar>
            {compact ? (
              <details className="viewer3d-options">
                <summary title="Colour by and opacity">View options</summary>
                <div className="viewer3d-options-body">{options}</div>
              </details>
            ) : (
              options
            )}
            <LevelFilterSelect levels={s.levels} filter={levelFilter} onChange={setLevelFilter} />
            <button type="button" onClick={s.refit} title="Frame the shown model again (also after you orbit or zoom)">
              Fit view
            </button>
          </ControlBar>
          <InfoPanel>
            <HoverInfo hovered={hovered} design={design} attributeKey={s.colorMode.kind === 'attribute' ? s.colorMode.key : null} />
            <div className="viewer3d-count">
              {doc.nodes.length} {design ? 'rooms' : 'cells'}
              {connectors.length > 0 && ` · ${connectors.length} connector cells`} · {s.levels.length} level{s.levels.length === 1 ? '' : 's'} ·{' '}
              {s.groups.count} access group{s.groups.count === 1 ? '' : 's'}
            </div>
            {range !== null && (
              <div className="viewer3d-count">
                Showing {nodeItems.length} of {doc.nodes.length} rooms · {levelFilterLabel(levelFilter)}
              </div>
            )}
            {hiddenNote && <div role="status" className="viewer3d-count">{hiddenNote}</div>}
          </InfoPanel>
          <RoomEditPanel editing={editing} />
          <Legend coloring={s.coloring} open={legendOpen} onOpenChange={setLegendOpen}>
            {s.emphasis.secondaryNodes.size > 0 && <div className="viewer3d-count">Selected edge: endpoints outlined</div>}
            {analysis && <div className="viewer3d-count">Fill: analysis “{analysis.title}”{analysis.stale ? ' (out of date)' : ''}</div>}
            {design && <ViewRelationshipLegend view="voxels" design={design} />}
          </Legend>
          {doc.nodes.length === 0 ? (
            <div className="viewer3d-empty">No nodes in this design.</div>
          ) : editing.active && compact ? null : (
            // Narrow panel while editing: the room editor already shows the snap and Esc hints.
            <div className={editing.active ? 'viewer3d-hint beside-edit' : 'viewer3d-hint'}>{NAVIGATION_HINT}</div>
          )}
        </>
      }
    >
      <LevelLabels levels={shownLevels} bounds={shownBounds} levelCentreY={(l) => spatialToThree([0, 0, l])[1]} />
      {nodeItems.map((n) => {
        const primary = s.emphasis.primaryNodes.has(n.id);
        const secondary = s.emphasis.secondaryNodes.has(n.id);
        const emphasised = primary || secondary;
        const isHovered = hovered?.kind === 'node' && hovered.id === n.id;
        const missing = s.coloring.missing.has(n.id);
        const overlay = analysisNodeStyle(n.id, analysis, selection);
        const color = overlay.fill ?? s.coloring.colorOf.get(n.id)!;
        const dimmed = editingId === n.id; // the gizmo's preview box carries the edit
        const base = overlay.fill ? Math.max(opacity, overlay.fillOpacity * 0.8) : opacity;
        const fill = dimmed ? 0.04 : primary ? Math.max(base, 0.65) : missing ? base * 0.55 : base;
        const scale: [number, number, number] = [n.extent[0] - GAP, n.extent[1] - GAP, n.extent[2] - GAP];
        return (
          <group key={n.id} position={[...n.position]}>
            <mesh geometry={geo.box} scale={scale} {...pickHandlers('node', n.id, onSelect, s.setHovered)}>
              <meshLambertMaterial
                color={primary ? SELECTION_COLOR : color}
                transparent
                opacity={isHovered && !primary ? Math.min(1, fill + 0.15) : fill}
                depthWrite={false}
              />
            </mesh>
            {missing ? (
              <lineSegments geometry={geo.edges} scale={scale} onUpdate={(l) => l.computeLineDistances()}>
                <lineDashedMaterial color="#5c5c55" dashSize={0.25} gapSize={0.18} transparent opacity={0.8} depthWrite={false} />
              </lineSegments>
            ) : (
              <lineSegments geometry={geo.edges} scale={scale}>
                <lineBasicMaterial color={color} transparent opacity={0.85} depthWrite={false} />
              </lineSegments>
            )}
            {emphasised && (
              // Drawn on top of everything so a selected room inside a cluster stays visible.
              <lineSegments geometry={geo.edges} scale={[scale[0] * 1.02, scale[1] * 1.02, scale[2] * 1.02]} renderOrder={10}>
                <lineBasicMaterial color={SELECTION_COLOR} depthTest={false} transparent opacity={primary ? 1 : 0.7} />
              </lineSegments>
            )}
          </group>
        );
      })}
      {design && (
        <ConnectorCells cells={connectors} selection={selection} onSelect={onSelect} setHovered={s.setHovered} hoveredEdge={hoveredEdge} />
      )}
      {unresolved.map((e) => {
        const line = lineOf(design, e.id);
        if (!line) return null;
        return (
          <RelationshipTube
            key={e.id}
            item={e}
            line={line}
            geometry={tube}
            selected={s.emphasis.edges.has(e.id)}
            analysed={isAnalysisEdge(analysis, e.id)}
            hovered={hoveredEdge === e.id}
            ghost={false}
            handlers={pickHandlers('edge', e.id, onSelect, s.setHovered)}
          />
        );
      })}
      <RoomEditGizmo editing={editing} />
    </SceneCanvas>
  );
}

function HoverInfo({
  hovered,
  design,
  attributeKey,
}: {
  readonly hovered: Hover | null;
  readonly design: ViewProps['design'];
  readonly attributeKey: string | null;
}) {
  if (!hovered) return <div className="viewer3d-count">Hover a {design ? 'room or connector' : 'voxel'}</div>;
  if (hovered.kind === 'edge') {
    const tip = tooltipOf(design, hovered.id);
    return tip ? <div>{tip}</div> : null;
  }
  const n = design.doc.nodes.find((x) => x.id === hovered.id);
  if (!n) return null;
  const value = attributeKey === null ? undefined : n.custom[attributeKey];
  return (
    <div>
      <strong>{nodeLabel(n)}</strong> · {n.function} · position [{n.position.join(', ')}] · size {n.size.join('×')}
      {attributeKey !== null && (
        <>
          {' '}
          · {attributeKey}: {value === undefined || value === null ? <em>no value</em> : String(value)}
        </>
      )}
    </div>
  );
}

/** Unit box shared by every room (scaled per room); created once per view and disposed on unmount. */
function useVoxelGeometry() {
  const geo = useMemo(() => {
    const box = new BoxGeometry(1, 1, 1);
    return { box, edges: new EdgesGeometry(box) };
  }, []);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);
  return geo;
}
