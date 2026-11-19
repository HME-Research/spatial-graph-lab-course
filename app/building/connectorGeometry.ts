import { FACE_DIRECTION_OFFSETS, neighbourCell, type FaceDirection, type GridCoord } from '@core/spatial';
import type { ConnectorStyle } from '@app/document';
import type { ConnectorRoute, Occupancy } from '@app/spatial';
import { DEFAULT_CELL_SIZE, spatialToThree, type CellSize, type WorldPoint } from '@core/viewer/coordinates';
import { selectEdge, type Selection } from '@core/viewer/selection';
import { DEFAULT_SLAB_THICKNESS, DEFAULT_WALL_THICKNESS, faceCentre } from './geometry';

/**
 * Straight connector geometry (03-building). Pure: ConnectorRoute → axis-aligned world boxes.
 *
 * The route itself (cells, faces, style) is DERIVED by the spatial resolver (02) and already
 * reserved in its occupancy; this module only draws it. It never adds, moves or reserves cells,
 * and it refuses (returns null) a route whose cells are not reserved for that edge.
 *
 * Per route cell, by style:
 * - `enclosed` (default): floor + roof + one wall on each side;
 * - `covered`: floor + roof + posts at every cell boundary, sides open;
 * - `deck`: floor only.
 * The two ENDS are always open (the room endpoint faces carry the door / opening).
 * A floor, roof, side wall or post is omitted where a room already provides that surface
 * (room cell directly below / above / beside), so no surface is doubled. Between two parallel
 * routes, a shared side wall is drawn once (by the lower edge id, unless only the other route is
 * enclosed).
 */

export type ConnectorPart = 'connector-floor' | 'connector-roof' | 'connector-wall' | 'connector-post';

export interface ConnectorElement {
  /** Deterministic: `${edgeId}:route:${cellIndex}:${part}:${n}`. */
  readonly id: string;
  readonly edgeId: string;
  readonly style: ConnectorStyle;
  readonly part: ConnectorPart;
  /** Route cell this element belongs to (grid space). */
  readonly cell: GridCoord;
  /** Picking a connector selects its originating relationship, never a new node. */
  readonly target: Selection;
  /** Box centre in Three.js world space. */
  readonly position: WorldPoint;
  /** Box extents along Three.js X, Y, Z. */
  readonly size: WorldPoint;
}

export interface ConnectorOptions {
  readonly cell?: CellSize;
  readonly wallThickness?: number;
  readonly slabThickness?: number;
  readonly postSize?: number;
  /** Effective style of another route by edge id (for walls shared by parallel routes). */
  readonly styleOfEdge?: (edgeId: string) => ConnectorStyle | undefined;
}

export const DEFAULT_POST_SIZE = 0.15;

const SIDES: Readonly<Record<'x' | 'y', readonly [FaceDirection, FaceDirection]>> = {
  x: ['+y', '-y'],
  y: ['+x', '-x'],
};

/** True when every route cell is reserved for this edge in the shared occupancy. */
export function isRouteReserved(route: ConnectorRoute, occupancy: Occupancy): boolean {
  return (
    route.cells.length > 0 &&
    route.cells.every((c) => {
      const o = occupancy.at(c);
      return o?.kind === 'route' && o.edgeId === route.edgeId;
    })
  );
}

/** World boxes of one straight connector, or null when its cells are not reserved for it. */
export function buildConnector(route: ConnectorRoute, occupancy: Occupancy, options: ConnectorOptions = {}): ConnectorElement[] | null {
  if (!isRouteReserved(route, occupancy)) return null;
  const cellSize = options.cell ?? DEFAULT_CELL_SIZE;
  const W = cellSize.horizontal;
  const H = cellSize.vertical;
  const wallT = options.wallThickness ?? DEFAULT_WALL_THICKNESS;
  const slabT = options.slabThickness ?? DEFAULT_SLAB_THICKNESS;
  const post = options.postSize ?? DEFAULT_POST_SIZE;
  const style = route.style;
  const target = selectEdge(route.edgeId);
  const out: ConnectorElement[] = [];

  const isRoom = (c: GridCoord) => occupancy.at(c)?.kind === 'room';

  route.cells.forEach((cell, i) => {
    let n = 0;
    const emit = (part: ConnectorPart, position: WorldPoint, size: WorldPoint) =>
      out.push({ id: `${route.edgeId}:route:${i}:${part}:${n++}`, edgeId: route.edgeId, style, part, cell, target, position, size });
    const centre = spatialToThree(cell, cellSize);

    if (!isRoom(neighbourCell(cell, '-z'))) emit('connector-floor', [centre[0], centre[1] - H / 2, centre[2]], [W, slabT, W]);
    if (style === 'deck') return;
    if (!isRoom(neighbourCell(cell, '+z'))) emit('connector-roof', [centre[0], centre[1] + H / 2, centre[2]], [W, slabT, W]);

    for (const side of SIDES[route.axis]) {
      const neighbour = occupancy.at(neighbourCell(cell, side));
      if (neighbour?.kind === 'room') continue; // the room's own (solid) wall bounds this side
      if (style === 'enclosed') {
        if (neighbour?.kind === 'route') {
          const other = options.styleOfEdge?.(neighbour.edgeId);
          const otherDraws = other === 'enclosed' && neighbour.edgeId < route.edgeId;
          if (otherDraws) continue;
        }
        const along = FACE_DIRECTION_OFFSETS[side][0] !== 0 ? 0 : 2; // wall normal on Three X or Z
        const size: [number, number, number] = along === 0 ? [wallT, H, W] : [W, H, wallT];
        emit('connector-wall', faceCentre(cell, side, cellSize), size);
      } else {
        // covered: posts at this cell's start boundary, plus the end boundary on the last cell.
        const wall = faceCentre(cell, side, cellSize);
        const axisIndex = route.axis === 'x' ? 0 : 2;
        const step = route.cells.length > 1 ? Math.sign(spatialToThree(route.cells[1]!, cellSize)[axisIndex] - spatialToThree(route.cells[0]!, cellSize)[axisIndex]) : 1;
        const boundaries = i === route.cells.length - 1 ? [-1, 1] : [-1];
        for (const b of boundaries) {
          const p: [number, number, number] = [wall[0], wall[1], wall[2]];
          p[axisIndex] += (b * step * W) / 2;
          emit('connector-post', p, [post, H - slabT, post]);
        }
      }
    }
  });
  return out;
}

/** Highlight rule for connectors: selecting the relationship lights its connector. */
export const isConnectorHighlighted = (element: ConnectorElement, selection: Selection): boolean =>
  selection.kind === 'edge' && selection.id === element.edgeId;
