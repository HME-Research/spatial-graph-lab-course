import { useEffect, useMemo, useState } from 'react';
import { BoxGeometry, CylinderGeometry, EdgesGeometry, Quaternion, SphereGeometry, Vector3 } from 'three';
import { SELECTION_COLOR } from '@core/viewer/appearance';
import type { ViewProps } from '../contracts';
import { DEFAULT_CELL_SIZE, spatialToThree } from '@core/viewer/coordinates';
import { NO_SELECTION } from '@core/viewer/selection';
import { dashIntervals, EDGE_STYLES } from '../three/edgeStyle';
import { SceneCanvas, SceneLabel } from '@core/viewer/three/SceneCanvas';
import { LevelLabels } from '../three/LevelLabels';
import type { EdgeItem, NodeItem } from '../three/sceneModel';
import { pickHandlers, type Hover } from '@core/viewer/three/picking';
import { useSpatialScene } from '../three/useSpatialScene';
import { useRemembered } from '../panelMemory';
import type { CameraState } from '@core/viewer/three/viewport';
import { ControlBar, InfoPanel, NAVIGATION_HINT } from '@core/viewer/three/ViewControls';
import { ColorBySelect, Legend, LevelSelect } from '../three/SpatialControls';
import { nodeLabel } from '@app/document/v2';
import { useAnalysisOverlay } from '../analysisOverlay';
import { analysisNodeStyle } from '../presentation/analysis';
import { lineOf, RelationshipTube, tooltipOf, useSceneSource, ViewRelationshipLegend } from '../three/v2Scene';

/**
 * Graph 3D: node markers at their cell centres (spatialToThree) and typed edges between centres.
 * Read-only: never calls onCommand and never reads diagram positions. Selection only changes
 * colours/scales, so scene geometry and the camera are untouched by selection changes.
 */

const NODE_RADIUS = 0.36;
/** Above this, per-node HTML labels are switched off by default (DOM cost). */
const LABEL_LIMIT = 150;

export function Graph3DView({ doc, selection, onSelect, design, project }: ViewProps) {
  const source = useSceneSource(doc, design);
  const s = useSpatialScene(source, selection, project?.attributes);
  const analysis = useAnalysisOverlay();
  const labelOf = useMemo(() => new Map((design?.doc.nodes ?? []).map((n) => [n.id, nodeLabel(n)] as const)), [design]);
  const camera = useRemembered<CameraState>('camera:graph3d');
  const [showLabels, setShowLabels] = useState(() => doc.nodes.length <= LABEL_LIMIT);
  const [showCells, setShowCells] = useState(true);
  const geo = useSharedGeometry();
  const nodeById = useMemo(() => new Map(s.nodeItems.map((n) => [n.id, n] as const)), [s.nodeItems]);
  const ghostNode = (n: NodeItem | undefined) => !!n && s.isLevelHidden(n.level);

  return (
    <SceneCanvas
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
            <ColorBySelect mode={s.colorMode} attributeKeys={s.attributeKeys} onChange={s.setColorMode} />
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
            <HoverInfo hovered={s.hovered} doc={doc} design={design} />
            <div className="viewer3d-count">
              {doc.nodes.length} nodes · {doc.edges.length} edges · {s.levels.length} level{s.levels.length === 1 ? '' : 's'} ·{' '}
              {s.groups.count} access group{s.groups.count === 1 ? '' : 's'}
            </div>
          </InfoPanel>
          <Legend coloring={s.coloring} showEdges={!design}>
            {analysis && <div className="viewer3d-count">Fill: analysis “{analysis.title}”{analysis.stale ? ' (out of date)' : ''}</div>}
            {design && <ViewRelationshipLegend view="graph3d" design={design} />}
          </Legend>
          {doc.nodes.length === 0 ? (
            <div className="viewer3d-empty">No nodes in this design.</div>
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
        if (line) {
          return (
            <RelationshipTube
              key={e.id}
              item={e}
              line={line}
              geometry={geo.unitCylinder}
              selected={s.emphasis.edges.has(e.id)}
              hovered={s.hovered?.kind === 'edge' && s.hovered.id === e.id}
              ghost={ghost}
              handlers={ghost ? undefined : pickHandlers('edge', e.id, onSelect, s.setHovered)}
              pickInset={NODE_RADIUS * 1.3}
            />
          );
        }
        return (
          <EdgeMarker
            key={e.id}
            item={e}
            geometry={geo.unitCylinder}
            selected={s.emphasis.edges.has(e.id)}
            hovered={s.hovered?.kind === 'edge' && s.hovered.id === e.id}
            ghost={ghost}
            handlers={ghost ? undefined : pickHandlers('edge', e.id, onSelect, s.setHovered)}
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
                text={overlay.valueLabel !== null ? `${labelOf.get(n.id) ?? n.id}: ${overlay.valueLabel}` : (labelOf.get(n.id) ?? n.id)}
                strong={primary || secondary}
              />
            )}
          </group>
        );
      })}
    </SceneCanvas>
  );
}

function EdgeMarker({
  item,
  geometry,
  selected,
  hovered,
  ghost,
  handlers,
}: {
  readonly item: EdgeItem;
  readonly geometry: CylinderGeometry;
  readonly selected: boolean;
  readonly hovered: boolean;
  readonly ghost: boolean;
  readonly handlers: ReturnType<typeof pickHandlers> | undefined;
}) {
  const style = EDGE_STYLES[item.kind];
  const [dx, dy, dz] = item.direction;
  const quaternion = useMemo(
    () => new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(dx, dy, dz)),
    [dx, dy, dz],
  );
  const segments = useMemo(() => dashIntervals(item.length, style.dashed), [item.length, style.dashed]);
  const radius = style.radius * (selected ? 1.9 : hovered ? 1.4 : 1);
  // Pick volume excludes the node spheres so clicking a node never selects its edge.
  const pickLength = Math.max(0.1, item.length - NODE_RADIUS * 2.6);
  return (
    <group position={[...item.mid]} quaternion={quaternion}>
      {segments.map(([from, to]) => (
        <mesh key={from} geometry={geometry} position={[0, (from + to) / 2 - item.length / 2, 0]} scale={[radius, to - from, radius]}>
          <meshLambertMaterial
            color={selected ? SELECTION_COLOR : style.color}
            transparent
            opacity={ghost ? 0.1 : 1}
            depthWrite={!ghost}
          />
        </mesh>
      ))}
      {handlers && (
        <mesh geometry={geometry} scale={[0.22, pickLength, 0.22]} {...handlers}>
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      )}
    </group>
  );
}

function HoverInfo({ hovered, doc, design }: { readonly hovered: Hover | null; readonly doc: ViewProps['doc']; readonly design: ViewProps['design'] }) {
  if (!hovered) return <div className="viewer3d-count">Hover a node or edge</div>;
  const tip = hovered.kind === 'edge' ? tooltipOf(design, hovered.id) : null;
  if (tip) return <div>{tip}</div>;
  const room = hovered.kind === 'node' ? design?.doc.nodes.find((x) => x.id === hovered.id) : undefined;
  if (room) {
    return (
      <div>
        <strong>{nodeLabel(room)}</strong> · {room.typeId} · grid [{room.grid.join(', ')}] · size {room.size.join('×')} · L{room.grid[2]}
      </div>
    );
  }
  if (hovered.kind === 'node') {
    const n = doc.nodes.find((x) => x.id === hovered.id);
    if (!n) return null;
    return (
      <div>
        <strong>{n.id}</strong> · {n.typeId} · grid [{n.grid.join(', ')}] · L{n.grid[2]}
      </div>
    );
  }
  const e = doc.edges.find((x) => x.id === hovered.id);
  if (!e) return null;
  return (
    <div>
      <strong>{e.id}</strong> · {EDGE_STYLES[e.kind].label} · {e.source} ↔ {e.target}
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
