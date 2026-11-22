import { useEffect, useMemo, useState } from 'react';
import { BoxGeometry, CylinderGeometry, EdgesGeometry, SphereGeometry } from 'three';
import { SELECTION_COLOR } from '@core/viewer/appearance';
import type { ViewProps } from '../contracts';
import { DEFAULT_CELL_SIZE, spatialToThree } from '@core/viewer/coordinates';
import { NO_SELECTION } from '@core/viewer/selection';
import { SceneCanvas, SceneLabel } from '@core/viewer/three/SceneCanvas';
import { LevelLabels } from '../three/LevelLabels';
import { cellBounds, framingFor } from '../three/sceneModel';
import { pickHandlers, type Hover } from '@core/viewer/three/picking';
import { useSpatialScene } from '../three/useSpatialScene';
import { useRemembered } from '../panelMemory';
import { useViewportCamera } from '../viewportCamera';
import type { CameraState } from '@core/viewer/three/viewport';
import { ControlBar, InfoPanel, NAVIGATION_HINT } from '@core/viewer/three/ViewControls';
import { ColorBySelect, Legend } from '../three/SpatialControls';
import { LevelFilterSelect, useLevelFilter } from '../three/LevelFilterSelect';
import { hiddenSelectionNote, levelFilterLabel, levelRange, roomsOnLevels, storeysOf } from '../three/levelFilter';
import { nodeLabel } from '@app/document';
import { useAnalysisOverlay } from '../analysisOverlay';
import { useFunctionName } from '../functionColour';
import { analysisNodeStyle, isAnalysisEdge } from '../presentation/analysis';
import { lineOf, RelationshipTube, tooltipOf, useSceneSource, ViewRelationshipLegend } from '../three/v2Scene';

/**
 * Graph 3D: node markers at their cell centres (spatialToThree) and typed edges between centres.
 * Read-only: never sends a command and never reads diagram positions. Selection only changes
 * colours/scales, so scene geometry and the camera are untouched by selection changes. The level
 * filter (as in the Voxel and Building views) shows the rooms with a storey in the chosen range and
 * the relationships between shown rooms only.
 */

const NODE_RADIUS = 0.36;
/** Above this, per-node HTML labels are switched off by default (DOM cost). */
const LABEL_LIMIT = 150;

export function Graph3DView({ selection, onSelect, design, project }: ViewProps) {
  const doc = design.doc;
  const source = useSceneSource(design);
  const s = useSpatialScene(source, selection, project?.attributes, design);
  const analysis = useAnalysisOverlay();
  const labelOf = useMemo(() => new Map(doc.nodes.map((n) => [n.id, nodeLabel(n)] as const)), [doc]);
  const camera = useRemembered<CameraState>('camera:graph3d');
  const viewportCamera = useViewportCamera();
  const [showLabels, setShowLabels] = useState(() => doc.nodes.length <= LABEL_LIMIT);
  const [showCells, setShowCells] = useState(true);
  const geo = useSharedGeometry();

  // Level filter (view state, remembered per panel; replaces the older faded "Up to Ln" cut).
  const [levelFilter, setLevelFilter] = useLevelFilter('graph3d', s.levels);
  const range = useMemo(() => levelRange(levelFilter), [levelFilter]);
  const shownNodes = useMemo(() => roomsOnLevels(source.nodes, range), [source.nodes, range]);
  const shownIds = useMemo(() => new Set(shownNodes.map((n) => n.id)), [shownNodes]);
  const nodeItems = useMemo(() => (range === null ? s.nodeItems : s.nodeItems.filter((n) => shownIds.has(n.id))), [range, s.nodeItems, shownIds]);
  const edgeItems = useMemo(
    () => (range === null ? s.edgeItems : s.edgeItems.filter((e) => shownIds.has(e.source) && shownIds.has(e.target))),
    [range, s.edgeItems, shownIds],
  );
  const shownBounds = useMemo(() => (range === null ? s.bounds : cellBounds(shownNodes)), [range, s.bounds, shownNodes]);
  const shownLevels = useMemo(() => (range === null ? s.levels : storeysOf(shownNodes)), [range, s.levels, shownNodes]);
  const framing = useMemo(() => (range === null ? s.framing : framingFor(shownBounds)), [range, s.framing, shownBounds]);
  const hiddenNote = hiddenSelectionNote(selection, shownIds, levelFilter);
  // A hovered item hidden by the filter must not keep the pointer cursor or info.
  const hovered =
    s.hovered && (s.hovered.kind === 'node' ? shownIds.has(s.hovered.id) : edgeItems.some((e) => e.id === s.hovered!.id)) ? s.hovered : null;

  return (
    <SceneCanvas
      {...viewportCamera}
      ariaLabel="Graph 3D view"
      framing={framing}
      cameraMemory={camera}
      fitRequest={s.fitRequest}
      grid={s.grid}
      cursor={hovered ? 'pointer' : 'grab'}
      onBackgroundClick={() => onSelect(NO_SELECTION)}
      overlay={
        <>
          <ControlBar>
            <ColorBySelect mode={s.colorMode} attributeKeys={s.attributeKeys} metrics={s.metricOptions} onChange={s.setColorMode} />
            <label>
              <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.currentTarget.checked)} /> Labels
            </label>
            <label>
              <input type="checkbox" checked={showCells} onChange={(e) => setShowCells(e.currentTarget.checked)} /> Cells
            </label>
            <LevelFilterSelect levels={s.levels} filter={levelFilter} onChange={setLevelFilter} />
            <button type="button" onClick={s.refit} title="Frame the shown model again (also after you orbit or zoom)">
              Fit view
            </button>
          </ControlBar>
          <InfoPanel>
            <HoverInfo hovered={hovered} design={design} />
            <div className="viewer3d-count">
              {doc.nodes.length} nodes · {doc.edges.length} edges · {s.levels.length} level{s.levels.length === 1 ? '' : 's'} ·{' '}
              {s.groups.count} access group{s.groups.count === 1 ? '' : 's'}
            </div>
            {range !== null && (
              <div className="viewer3d-count">
                Showing {nodeItems.length} of {doc.nodes.length} rooms · {levelFilterLabel(levelFilter)}
              </div>
            )}
            {hiddenNote && <div role="status" className="viewer3d-count">{hiddenNote}</div>}
          </InfoPanel>
          <Legend coloring={s.coloring}>
            {analysis && <div className="viewer3d-count">Fill: analysis “{analysis.title}”{analysis.stale ? ' (out of date)' : ''}</div>}
            <ViewRelationshipLegend view="graph3d" design={design} />
          </Legend>
          {doc.nodes.length === 0 ? (
            <div className="viewer3d-empty">No nodes in this scenario.</div>
          ) : (
            <div className="viewer3d-hint">{NAVIGATION_HINT}</div>
          )}
        </>
      }
    >
      <LevelLabels levels={shownLevels} bounds={shownBounds} levelCentreY={(l) => spatialToThree([0, 0, l])[1]} />
      {showCells &&
        nodeItems.map((n) => (
          <lineSegments key={`cell:${n.id}`} geometry={geo.cellEdges} position={[...n.position]}>
            <lineBasicMaterial color="#8d8d84" transparent opacity={0.3} depthWrite={false} />
          </lineSegments>
        ))}
      {edgeItems.map((e) => {
        const line = lineOf(design, e.id);
        if (!line) return null;
        return (
          <RelationshipTube
            key={e.id}
            item={e}
            line={line}
            geometry={geo.unitCylinder}
            selected={s.emphasis.edges.has(e.id)}
            analysed={isAnalysisEdge(analysis, e.id)}
            hovered={hovered?.kind === 'edge' && hovered.id === e.id}
            ghost={false}
            handlers={pickHandlers('edge', e.id, onSelect, s.setHovered)}
            pickInset={NODE_RADIUS * 1.3}
          />
        );
      })}
      {nodeItems.map((n) => {
        const primary = s.emphasis.primaryNodes.has(n.id);
        const secondary = s.emphasis.secondaryNodes.has(n.id);
        const isHovered = hovered?.kind === 'node' && hovered.id === n.id;
        const overlay = analysisNodeStyle(n.id, analysis, selection);
        const color = overlay.fill ?? s.coloring.colorOf.get(n.id)!;
        const missing = s.coloring.missing.has(n.id);
        return (
          <group key={n.id} position={[...n.position]}>
            <mesh
              geometry={geo.sphere}
              scale={primary ? 1.3 : isHovered ? 1.12 : 1}
              {...pickHandlers('node', n.id, onSelect, s.setHovered)}
            >
              <meshLambertMaterial
                color={primary ? SELECTION_COLOR : color}
                emissive={secondary ? SELECTION_COLOR : '#000000'}
                emissiveIntensity={secondary ? 0.35 : 0}
                transparent
                opacity={missing ? 0.75 : 1}
              />
            </mesh>
            {(primary || secondary) && (
              <mesh geometry={geo.halo} scale={primary ? 1.3 : 1}>
                <meshBasicMaterial color={SELECTION_COLOR} wireframe transparent opacity={primary ? 0.7 : 0.45} />
              </mesh>
            )}
            {showLabels && (
              <SceneLabel
                position={[0, NODE_RADIUS * 1.9, 0]}
                text={overlay.valueLabel !== null ? `${labelOf.get(n.id) ?? String(n.id)}: ${overlay.valueLabel}` : (labelOf.get(n.id) ?? String(n.id))}
                strong={primary || secondary}
              />
            )}
          </group>
        );
      })}
    </SceneCanvas>
  );
}

function HoverInfo({ hovered, design }: { readonly hovered: Hover | null; readonly design: ViewProps['design'] }) {
  const functionName = useFunctionName();
  if (!hovered) return <div className="viewer3d-count">Hover a node or edge</div>;
  if (hovered.kind === 'edge') {
    const tip = tooltipOf(design, hovered.id);
    return tip ? <div>{tip}</div> : null;
  }
  const room = design.doc.nodes.find((x) => x.id === hovered.id);
  if (!room) return null;
  return (
    <div>
      <strong>{nodeLabel(room)}</strong> · {functionName(room.function)} · position [{room.position.join(', ')}] · size {room.size.join('×')} · L{room.position[2]}
    </div>
  );
}


/** Geometry shared by every marker; created once per view and disposed on unmount. */
function useSharedGeometry() {
  const geo = useMemo(() => {
    const { horizontal: h, vertical: v } = DEFAULT_CELL_SIZE;
    const cellBox = new BoxGeometry(h, v, h);
    const shared = {
      sphere: new SphereGeometry(NODE_RADIUS, 24, 16),
      halo: new SphereGeometry(NODE_RADIUS * 1.45, 16, 10),
      unitCylinder: new CylinderGeometry(1, 1, 1, 12),
      cellEdges: new EdgesGeometry(cellBox),
    };
    cellBox.dispose();
    return shared;
  }, []);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);
  return geo;
}
