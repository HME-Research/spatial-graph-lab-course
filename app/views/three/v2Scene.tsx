import { useEffect, useMemo } from 'react';
import { BoxGeometry, CylinderGeometry, EdgesGeometry, Quaternion, Vector3 } from 'three';
import type { RelationshipEdge, RoomNode } from '@app/document';
import type { DesignPort } from '@app/spatial';
import { SELECTION_COLOR } from '@core/viewer/appearance';
import { DEFAULT_CELL_SIZE, spatialToThree, type WorldPoint } from '@core/viewer/coordinates';
import type { Selection } from '@core/viewer/selection';
import { pickHandlers } from '@core/viewer/three/picking';
import type { ViewMode } from '../contracts';
import { RelationshipLegend } from '../presentation/LegendViews';
import { CONNECTOR_CELL_COLOR, relationshipLegend } from '../presentation/legend';
import { connectorStylesInUse, presentEdgeById, summarizeRelationships } from '../presentation/relationships';
import type { LineToken } from '../presentation/vocabulary';
import { dashIntervals } from './edgeStyle';
import type { EdgeItem } from './sceneModel';
import './v2Scene.css';

/**
 * Shared pieces for the 3D views: they draw ROOMS (minimum corner + size) from `design.doc` and
 * style relationships from the derived resolution (`design.spatial`) with the one line scheme
 * (`relationshipLine`). A 3D relationship line is a relationship, never a stair or corridor.
 */

export type SceneNode = RoomNode;

/** What a 3D view draws: rooms and relationships. */
export interface SceneSource {
  readonly nodes: readonly SceneNode[];
  readonly edges: readonly RelationshipEdge[];
}

/** The rooms and relationships of the port's document. Identity-stable per document. */
export function useSceneSource(design: DesignPort): SceneSource {
  return design.doc;
}

/** Line token for an edge from the derived resolution, or null for an unknown edge. */
export const lineOf = (design: DesignPort, edgeId: string): LineToken | null => presentEdgeById(design.spatial, edgeId)?.line ?? null;

/** One-line tooltip for an edge from the shared presentation (status, kind, reason). */
export const tooltipOf = (design: DesignPort, edgeId: string): string | null => presentEdgeById(design.spatial, edgeId)?.tooltip ?? null;

/** A relationship drawn as a (dashed) tube with the shared line token. */
export function RelationshipTube({
  item,
  line,
  geometry,
  selected,
  hovered,
  ghost,
  handlers,
  pickInset = 0,
}: {
  readonly item: EdgeItem;
  readonly line: LineToken;
  readonly geometry: CylinderGeometry;
  readonly selected: boolean;
  readonly hovered: boolean;
  readonly ghost: boolean;
  readonly handlers: ReturnType<typeof pickHandlers> | undefined;
  /** Length removed from the pick volume at each end (e.g. node spheres), so nodes win picking. */
  readonly pickInset?: number;
}) {
  const [dx, dy, dz] = item.direction;
  const quaternion = useMemo(() => new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(dx, dy, dz)), [dx, dy, dz]);
  const dash = line.dash3d;
  const segments = useMemo(
    () => (dash ? dashIntervals(item.length, true, dash[0], dash[1]) : dashIntervals(item.length, false)),
    [item.length, dash],
  );
  const radius = line.radius3d * (selected ? 1.9 : hovered ? 1.4 : 1);
  const pickLength = Math.max(0.1, item.length - pickInset * 2);
  return (
    <group position={[...item.mid]} quaternion={quaternion}>
      {segments.map(([from, to]) => (
        <mesh key={from} geometry={geometry} position={[0, (from + to) / 2 - item.length / 2, 0]} scale={[radius, to - from, radius]}>
          <meshLambertMaterial color={selected ? SELECTION_COLOR : line.color} transparent opacity={ghost ? 0.1 : 1} depthWrite={!ghost} />
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

/** A shared unit cylinder for tubes; disposed with the view. */
export function useUnitCylinder(): CylinderGeometry {
  const geometry = useMemo(() => new CylinderGeometry(1, 1, 1, 12), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

export interface ConnectorCell {
  readonly key: string;
  readonly edgeId: string;
  readonly position: WorldPoint;
  readonly size: WorldPoint;
}

/** One low box per reserved connector cell (Voxels): the cells a generated corridor occupies. */
export function connectorCells(design: DesignPort | undefined): ConnectorCell[] {
  if (!design) return [];
  const { horizontal: h, vertical: v } = DEFAULT_CELL_SIZE;
  const out: ConnectorCell[] = [];
  for (const r of design.spatial.edges) {
    if (r.status !== 'routed') continue;
    for (const cell of r.route.cells) {
      const centre = spatialToThree(cell);
      // Floor-height slab, so connector cells read as "ground used by a corridor", not as rooms.
      out.push({
        key: `${r.edgeId}:${cell.join(',')}`,
        edgeId: r.edgeId,
        position: [centre[0], centre[1] - v / 2 + v * 0.1, centre[2]],
        size: [h * 0.94, v * 0.2, h * 0.94],
      });
    }
  }
  return out;
}

/** Translucent, pickable connector cells; picking selects the relationship that owns them. */
export function ConnectorCells({
  cells,
  selection,
  onSelect,
  setHovered,
  hoveredEdge,
}: {
  readonly cells: readonly ConnectorCell[];
  readonly selection: Selection;
  readonly onSelect: Parameters<typeof pickHandlers>[2];
  readonly setHovered: Parameters<typeof pickHandlers>[3];
  readonly hoveredEdge: string | null;
}) {
  const geo = useMemo(() => {
    const box = new BoxGeometry(1, 1, 1);
    return { box, edges: new EdgesGeometry(box) };
  }, []);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);
  return (
    <>
      {cells.map((c) => {
        const selected = selection.kind === 'edge' && selection.id === c.edgeId;
        const hovered = hoveredEdge === c.edgeId;
        return (
          <group key={c.key} position={[...c.position]} scale={[...c.size]}>
            <mesh geometry={geo.box} {...pickHandlers('edge', c.edgeId, onSelect, setHovered)}>
              <meshLambertMaterial
                color={selected ? SELECTION_COLOR : CONNECTOR_CELL_COLOR}
                transparent
                opacity={selected ? 0.75 : hovered ? 0.7 : 0.55}
                depthWrite={false}
              />
            </mesh>
            <lineSegments geometry={geo.edges}>
              <lineBasicMaterial color={selected ? SELECTION_COLOR : '#8f8572'} transparent opacity={0.8} depthWrite={false} />
            </lineSegments>
          </group>
        );
      })}
    </>
  );
}

/** The shared relationship legend for a 3D view, compact and collapsed so it never covers the model. */
export function ViewRelationshipLegend({
  view,
  design,
  standalone = false,
}: {
  readonly view: ViewMode;
  readonly design: DesignPort;
  /** Placed directly in the overlay grid instead of inside a legend panel. */
  readonly standalone?: boolean;
}) {
  const legend = useMemo(
    () =>
      relationshipLegend(view, {
        statusCounts: summarizeRelationships(design.spatial).counts,
        connectorStyles: connectorStylesInUse(design.spatial),
        compact: true,
      }),
    [view, design.spatial],
  );
  return (
    <div className={standalone ? 'viewer3d-relationship-legend standalone' : 'viewer3d-relationship-legend'}>
      <RelationshipLegend legend={legend} defaultOpen={false} />
    </div>
  );
}
