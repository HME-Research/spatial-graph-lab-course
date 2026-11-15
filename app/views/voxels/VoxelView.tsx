import { useEffect, useMemo, useState } from 'react';
import { BoxGeometry, EdgesGeometry } from 'three';
import { nodeLabel } from '@app/document/v2';
import { SELECTION_COLOR } from '@core/viewer/appearance';
import type { ViewProps } from '../contracts';
import { DEFAULT_CELL_SIZE, spatialToThree } from '@core/viewer/coordinates';
import { NO_SELECTION } from '@core/viewer/selection';
import { SceneCanvas } from '@core/viewer/three/SceneCanvas';
import { LevelLabels } from '../three/LevelLabels';
import { pickHandlers, type Hover } from '@core/viewer/three/picking';
import { useSpatialScene } from '../three/useSpatialScene';
import { useRemembered } from '../panelMemory';
import type { CameraState } from '@core/viewer/three/viewport';
import { ControlBar, InfoPanel, NAVIGATION_HINT } from '@core/viewer/three/ViewControls';
import { ColorBySelect, Legend, LevelSelect } from '../three/SpatialControls';
import { framingFor, includeBoxes } from '../three/sceneModel';
import { RoomEditGizmo, RoomEditPanel, useRoomEditing } from '../three/editing';
import { useAnalysisOverlay } from '../analysisOverlay';
import { analysisNodeStyle } from '../presentation/analysis';
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

export function VoxelView({ doc, selection, onSelect, design }: ViewProps) {
  const source = useSceneSource(doc, design);
  const s = useSpatialScene(source, selection);
  const camera = useRemembered<CameraState>('camera:voxels');
  const [opacity, setOpacity] = useState(BASE_OPACITY);
  const geo = useVoxelGeometry();
  const tube = useUnitCylinder();
  const editing = useRoomEditing(design, selection);
  const analysis = useAnalysisOverlay();

  const connectors = useMemo(() => connectorCells(design), [design]);
  const framing = useMemo(() => framingFor(includeBoxes(s.bounds, connectors)), [s.bounds, connectors]);
  const unresolved = useMemo(
    () => (design ? s.edgeItems.filter((e) => design.spatial.byEdge.get(e.id)?.status === 'unresolved') : []),
    [design, s.edgeItems],
  );
  const hoveredEdge = s.hovered?.kind === 'edge' ? s.hovered.id : null;
  const editingId = editing.state.phase !== 'idle' ? editing.nodeId : null;

  return (
    <SceneCanvas
      ariaLabel="Voxel view"
      framing={framing}
      cameraMemory={camera}
      fitRequest={s.fitRequest}
      grid={s.grid}
      cursor={s.hovered ? 'pointer' : 'grab'}
      onBackgroundClick={() => onSelect(NO_SELECTION)}
      overlay={
        <>
          <ControlBar>
            <ColorBySelect mode={s.colorMode} attributeKeys={s.attributeKeys} onChange={s.setColorMode} />
            <LevelSelect levels={s.levels} maxLevel={s.maxLevel} onChange={s.setMaxLevel} />
            <label title="Voxel opacity">
              Opacity{' '}
              <input
                type="range"
                min={0.15}
                max={0.9}
                step={0.05}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.currentTarget.value))}
              />
            </label>
            <button type="button" onClick={s.refit}>
              Fit view
            </button>
          </ControlBar>
          <InfoPanel>
            <HoverInfo hovered={s.hovered} doc={doc} design={design} attributeKey={s.colorMode.kind === 'attribute' ? s.colorMode.key : null} />
            <div className="viewer3d-count">
              {doc.nodes.length} {design ? 'rooms' : 'cells'}
              {connectors.length > 0 && ` · ${connectors.length} connector cells`} · {s.levels.length} level{s.levels.length === 1 ? '' : 's'} ·{' '}
              {s.groups.count} access group{s.groups.count === 1 ? '' : 's'}
            </div>
          </InfoPanel>
          <RoomEditPanel editing={editing} />
          <Legend coloring={s.coloring}>
            {s.emphasis.secondaryNodes.size > 0 && <div className="viewer3d-count">Selected edge: endpoints outlined</div>}
            {analysis && <div className="viewer3d-count">Fill: analysis “{analysis.title}”{analysis.stale ? ' (out of date)' : ''}</div>}
            {design && <ViewRelationshipLegend view="voxels" design={design} />}
          </Legend>
          {doc.nodes.length === 0 ? (
            <div className="viewer3d-empty">No nodes in this design.</div>
          ) : (
            <div className="viewer3d-hint">{editing.active ? `${editing.hint} · ${NAVIGATION_HINT}` : NAVIGATION_HINT}</div>
          )}
        </>
      }
    >
      <LevelLabels levels={s.levels} bounds={s.bounds} levelCentreY={(l) => spatialToThree([0, 0, l])[1]} hidden={s.isLevelHidden} />
      {s.nodeItems.map((n) => {
        const ghost = s.isLevelHidden(n.level);
        const primary = s.emphasis.primaryNodes.has(n.id);
        const secondary = s.emphasis.secondaryNodes.has(n.id);
        const emphasised = primary || secondary;
        const hovered = s.hovered?.kind === 'node' && s.hovered.id === n.id;
        const missing = s.coloring.missing.has(n.id);
        const overlay = analysisNodeStyle(n.id, analysis, selection);
        const color = overlay.fill ?? s.coloring.colorOf.get(n.id)!;
        const dimmed = editingId === n.id; // the gizmo's preview box carries the edit
        const base = overlay.fill ? Math.max(opacity, overlay.fillOpacity * 0.8) : opacity;
        const fill = ghost || dimmed ? 0.04 : primary ? Math.max(base, 0.65) : missing ? base * 0.55 : base;
        const scale: [number, number, number] = [n.extent[0] - GAP, n.extent[1] - GAP, n.extent[2] - GAP];
        return (
          <group key={n.id} position={[...n.position]}>
            <mesh geometry={geo.box} scale={scale} {...(ghost ? {} : pickHandlers('node', n.id, onSelect, s.setHovered))}>
              <meshLambertMaterial
                color={primary ? SELECTION_COLOR : color}
                transparent
                opacity={hovered && !primary ? Math.min(1, fill + 0.15) : fill}
                depthWrite={false}
              />
            </mesh>
            {missing && !ghost ? (
              <lineSegments geometry={geo.edges} scale={scale} onUpdate={(l) => l.computeLineDistances()}>
                <lineDashedMaterial color="#5c5c55" dashSize={0.25} gapSize={0.18} transparent opacity={0.8} depthWrite={false} />
              </lineSegments>
            ) : (
              <lineSegments geometry={geo.edges} scale={scale}>
                <lineBasicMaterial color={color} transparent opacity={ghost ? 0.12 : 0.85} depthWrite={false} />
              </lineSegments>
            )}
            {emphasised && !ghost && (
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
  doc,
  design,
  attributeKey,
}: {
  readonly hovered: Hover | null;
  readonly doc: ViewProps['doc'];
  readonly design: ViewProps['design'];
  readonly attributeKey: string | null;
}) {
  if (!hovered) return <div className="viewer3d-count">Hover a {design ? 'room or connector' : 'voxel'}</div>;
  if (hovered.kind === 'edge') {
    const tip = tooltipOf(design, hovered.id);
    return tip ? <div>{tip}</div> : null;
  }
  const room = design?.doc.nodes.find((x) => x.id === hovered.id);
  const n = doc.nodes.find((x) => x.id === hovered.id);
  if (!n) return null;
  const value = attributeKey === null ? undefined : n.attributes[attributeKey];
  return (
    <div>
      <strong>{room ? nodeLabel(room) : n.id}</strong> · {n.typeId} · grid [{n.grid.join(', ')}]
      {room && ` · size ${room.size.join('×')}`}
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
