import { neighbourCell, type FaceDirection, type GridCoord } from '@core/spatial';
import type { EffectiveCorridorLook, WallStyle } from '@app/document';
import type { ConnectorRoute, Occupancy } from '@app/spatial';
import { DEFAULT_CELL_SIZE, spatialToThree, type CellSize, type WorldPoint } from '@core/viewer/coordinates';
import { selectEdge, type Selection } from '@core/viewer/selection';
import { DEFAULT_SLAB_THICKNESS, DEFAULT_WALL_THICKNESS, faceCentre } from './geometry';
import { OPENING_PROPORTIONS } from './faceLayout';

/**
 * Straight connector geometry (03-building). Pure: ConnectorRoute → axis-aligned world boxes.
 *
 * The route itself (cells, faces, look) is DERIVED by the spatial resolver (02) and already
 * reserved in its occupancy; this module only draws it. It never adds, moves or reserves cells,
 * and it refuses (returns null) a route whose cells are not reserved for that edge.
 *
 * Per route cell, by the route's look (`route.look`, owner 2026-11-19 "Corridors as a look card"):
 * - always a floor;
 * - roof: `flat` = one slab; `pergola` = open slats across the corridor, the same count and width
 *   per cell as a room pergola's bay (`OPENING_PROPORTIONS.pergola*`); `none` = no roof part.
 *   Roof parts (slab or slats) are all `connector-roof`;
 * - walls: `enclosed` = one side wall on each side; `open` = open sides, with posts at every cell
 *   boundary only where there is a roof to carry (open + none = floor only).
 * Width (`route.look.width`, 2026-11-19): floor, roof (slab or slats), side walls and posts are
 * built at the corridor's width (at most the cell), centred on the cell's axis along the corridor;
 * the corridor still takes its whole cells. The side walls and posts stand on the corridor's
 * edges (at the cell's faces when it is a full cell wide, as before).
 * The two ENDS are always open (the room endpoint faces carry the door / opening, no wider than
 * the corridor: `corridorWidth` on the face, see faceLayout).
 * A floor or roof is omitted where a room already provides that surface (room cell directly below
 * / above). A side wall or post is omitted beside a room only when the corridor is a full cell
 * wide (the room's wall is then its side); between two parallel full-width routes, a shared side
 * wall is drawn once (by the lower edge id, unless only the other route is enclosed). A narrower
 * corridor always has its own sides.
 */

export type ConnectorPart = 'connector-floor' | 'connector-roof' | 'connector-wall' | 'connector-post';

export interface ConnectorElement {
  /** Deterministic: `${edgeId}:route:${cellIndex}:${part}:${n}`. */
  readonly id: string;
  readonly edgeId: number;
  /** The route's effective walls and roof. */
  readonly look: EffectiveCorridorLook;
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
  /** Effective walls of another route by edge id (for walls shared by parallel routes). */
  readonly wallsOfEdge?: (edgeId: number) => WallStyle | undefined;
  /** Built width (m) of another route by edge id: a shared wall is shared only between full-width routes. */
  readonly widthOfEdge?: (edgeId: number) => number | undefined;
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
  const look = route.look;
  const { walls, roof } = look;
  const target = selectEdge(route.edgeId);
  const out: ConnectorElement[] = [];
  const axisIndex = route.axis === 'x' ? 0 : 2; // route axis in Three space (grid y → Three Z)
  const acrossIndex = axisIndex === 0 ? 2 : 0;
  // Built width across the corridor, centred; at most the cell.
  const wc = Math.min(look.width, W);
  const fullWidth = wc >= W - 1e-9;
  /** A box `along` long (route axis), `height` high and `across` wide. */
  const boxSize = (along: number, height: number, across: number): [number, number, number] =>
    axisIndex === 0 ? [along, height, across] : [across, height, along];

  const isRoom = (c: GridCoord) => occupancy.at(c)?.kind === 'room';

  route.cells.forEach((cell, i) => {
    let n = 0;
    const emit = (part: ConnectorPart, position: WorldPoint, size: WorldPoint) =>
      out.push({ id: `${route.edgeId}:route:${i}:${part}:${n++}`, edgeId: route.edgeId, look, part, cell, target, position, size });
    const centre = spatialToThree(cell, cellSize);

    if (!isRoom(neighbourCell(cell, '-z'))) emit('connector-floor', [centre[0], centre[1] - H / 2, centre[2]], boxSize(W, slabT, wc));
    if (roof !== 'none' && !isRoom(neighbourCell(cell, '+z'))) {
      const y = centre[1] + H / 2;
      if (roof === 'flat') emit('connector-roof', [centre[0], y, centre[2]], boxSize(W, slabT, wc));
      else {
        // Pergola: slats across the corridor, evenly spaced along it (as a room pergola's bay).
        const count = OPENING_PROPORTIONS.pergolaSlats;
        const w = W * OPENING_PROPORTIONS.pergolaSlatFraction;
        const step = (W - w) / (count - 1);
        for (let k = 0; k < count; k++) {
          const p: [number, number, number] = [centre[0], y, centre[2]];
          p[axisIndex] += -W / 2 + w / 2 + k * step;
          emit('connector-roof', p, boxSize(w, slabT, wc));
        }
      }
    }

    for (const side of SIDES[route.axis]) {
      const neighbour = occupancy.at(neighbourCell(cell, side));
      if (fullWidth && neighbour?.kind === 'room') continue; // the room's own (solid) wall bounds this side
      // This side's line: the cell's face for a full-width corridor, else the corridor's edge.
      const face = faceCentre(cell, side, cellSize);
      const edge: [number, number, number] = [face[0], face[1], face[2]];
      edge[acrossIndex] = centre[acrossIndex]! + Math.sign(face[acrossIndex]! - centre[acrossIndex]!) * (wc / 2);
      if (walls === 'enclosed') {
        if (fullWidth && neighbour?.kind === 'route') {
          const other = options.wallsOfEdge?.(neighbour.edgeId);
          const otherWidth = options.widthOfEdge?.(neighbour.edgeId) ?? W;
          const otherDraws = other === 'enclosed' && otherWidth >= W - 1e-9 && neighbour.edgeId < route.edgeId;
          if (otherDraws) continue;
        }
        emit('connector-wall', fullWidth ? face : edge, boxSize(W, H, wallT));
      } else if (roof !== 'none') {
        // Open sides under a roof: posts at this cell's start boundary, plus the end boundary on the last cell.
        const wall = fullWidth ? face : edge;
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
