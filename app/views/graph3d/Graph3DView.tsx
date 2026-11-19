import { useEffect, useMemo, useState } from 'react';
import { BoxGeometry, CylinderGeometry, EdgesGeometry, SphereGeometry } from 'three';
import { SELECTION_COLOR } from '@core/viewer/appearance';
import type { ViewProps } from '../contracts';
import { DEFAULT_CELL_SIZE, spatialToThree } from '@core/viewer/coordinates';
import { NO_SELECTION } from '@core/viewer/selection';
import { SceneCanvas, SceneLabel } from '@core/viewer/three/SceneCanvas';
import { LevelLabels } from '../three/LevelLabels';
import type { NodeItem } from '../three/sceneModel';
import { pickHandlers, type Hover } from '@core/viewer/three/picking';
import { useSpatialScene } from '../three/useSpatialScene';
import { useRemembered } from '../panelMemory';
import { useViewportCamera } from '../viewportCamera';
import type { CameraState } from '@core/viewer/three/viewport';
import { ControlBar, InfoPanel, NAVIGATION_HINT } from '@core/viewer/three/ViewControls';
import { ColorBySelect, Legend, LevelSelect } from '../three/SpatialControls';
import { nodeLabel } from '@app/document';
import { useAnalysisOverlay } from '../analysisOverlay';
import { analysisNodeStyle, isAnalysisEdge } from '../presentation/analysis';
import { lineOf, RelationshipTube, tooltipOf, useSceneSource, ViewRelationshipLegend } from '../three/v2Scene';

/**
 * Graph 3D: node markers at their cell centres (spatialToThree) and typed edges between centres.
 * Read-only: never sends a command and never reads diagram positions. Selection only changes
 * colours/scales, so scene geometry and the camera are untouched by selection changes.
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
  const nodeById = useMemo(() => new Map(s.nodeItems.map((n) => [n.id, n] as const)), [s.nodeItems]);
  const ghostNode = (n: NodeItem | undefined) => !!n && s.isLevelHidden(n.level);

  return (
    <SceneCanvas
      {...viewportCamera}
      ariaLabel="Graph 3D view"
      framing={s.framing}
      cameraMemory={camera}
      fitRequest={s.fitRequest}
      grid={s.grid}
      cursor={s.hovered ? 'pointer' : 'grab'}
      onBackgroundClick={() => onSelect(NO_SELECTION)}
      overlay={
        <>
          <ControlBar>
            <ColorBySelect mode={s.colorMode} attributeKeys={s.attributeKeys} metrics={s.metricOptions} onChange={s.setColorMode} />
            <LevelSelect levels={s.levels} maxLevel={s.maxLevel} onChange={s.setMaxLevel} />
            <label>
              <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.currentTarget.checked)} /> Labels
            </label>
            <label>
              <input type="checkbox" checked={showCells} onChange={(e) => setShowCells(e.currentTarget.checked)} /> Cells
            </label>
            <button type="button" onClick={s.refit} title="Frame the whole model again (also after you orbit or zoom)">
              Fit view
            </button>
          </ControlBar>
          <InfoPanel>
            <HoverInfo hovered={s.hovered} design={design} />
            <div className="viewer3d-count">
              {doc.nodes.length} nodes · {doc.edges.length} edges · {s.levels.length} level{s.levels.length === 1 ? '' : 's'} ·{' '}
              {s.groups.count} access group{s.groups.count === 1 ? '' : 's'}
            </div>
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
      <LevelLabels
        levels={s.levels}
        bounds={s.bounds}
        levelCentreY={(l) => spatialToThree([0, 0, l])[1]}
        hidden={s.isLevelHidden}
      />
      {showCells &&
        s.nodeItems.map((n) => (
          <lineSegments key={`cell:${n.id}`} geometry={geo.cellEdges} position={[...n.position]}>
            <lineBasicMaterial color="#8d8d84" transparent opacity={s.isLevelHidden(n.level) ? 0.08 : 0.3} depthWrite={false} />
          </lineSegments>
        ))}
      {s.edgeItems.map((e) => {
        const ghost = ghostNode(nodeById.get(e.source)) || ghostNode(nodeById.get(e.target));
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
            hovered={s.hovered?.kind === 'edge' && s.hovered.id === e.id}
            ghost={ghost}
            handlers={ghost ? undefined : pickHandlers('edge', e.id, onSelect, s.setHovered)}
            pickInset={NODE_RADIUS * 1.3}
          />
        );
      })}
      {s.nodeItems.map((n) => {
        const ghost = s.isLevelHidden(n.level);
        const primary = s.emphasis.primaryNodes.has(n.id);
        const secondary = s.emphasis.secondaryNodes.has(n.id);
        const hovered = s.hovered?.kind === 'node' && s.hovered.id === n.id;
        const overlay = analysisNodeStyle(n.id, analysis, selection);
        const color = overlay.fill ?? s.coloring.colorOf.get(n.id)!;
        const missing = s.coloring.missing.has(n.id);
        return (
          <group key={n.id} position={[...n.position]}>
            <mesh
              geometry={geo.sphere}
              scale={primary ? 1.3 : hovered ? 1.12 : 1}
              {...(ghost ? {} : pickHandlers('node', n.id, onSelect, s.setHovered))}
            >
              <meshLambertMaterial
                color={primary ? SELECTION_COLOR : color}
                emissive={secondary ? SELECTION_COLOR : '#000000'}
                emissiveIntensity={secondary ? 0.35 : 0}
                transparent
                opacity={ghost ? 0.12 : missing ? 0.75 : 1}
                depthWrite={!ghost}
              />
            </mesh>
            {(primary || secondary) && !ghost && (
              <mesh geometry={geo.halo} scale={primary ? 1.3 : 1}>
                <meshBasicMaterial color={SELECTION_COLOR} wireframe transparent opacity={primary ? 0.7 : 0.45} />
              </mesh>
            )}
            {showLabels && !ghost && (
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
  if (!hovered) return <div className="viewer3d-count">Hover a node or edge</div>;
  if (hovered.kind === 'edge') {
    const tip = tooltipOf(design, hovered.id);
    return tip ? <div>{tip}</div> : null;
  }
  const room = design.doc.nodes.find((x) => x.id === hovered.id);
  if (!room) return null;
  return (
    <div>
      <strong>{nodeLabel(room)}</strong> · {room.function} · position [{room.position.join(', ')}] · size {room.size.join('×')} · L{room.position[2]}
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
