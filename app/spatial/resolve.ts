import { gridKey, type GridCoord } from '@core/spatial';
import {
  connectorStyleOf,
  footprintCells,
  levelRange,
  roomContact,
  sharedFaces,
  type RelationshipEdge,
  type RoomNode,
} from '@app/document';
import type { CellOccupant, EdgeResolution, Occupancy, RelationshipResolver, SpatialResolution } from './contracts';
import { findStraightRoute } from './straightRoute';

/**
 * Relationship resolver (02-spatial-engine implementation of the frozen Gate 0 contract).
 *
 * - Touching rooms → `direct` (horizontal or vertical contact; faces seen from the source).
 * - Separated, no common storey → `unresolved` / `different-level`.
 * - Separated, common storey → the first free straight, axis-aligned connector
 *   (`findStraightRoute`), else `unresolved` / `not-aligned` | `blocked-by-room` |
 *   `blocked-by-route`. Edges are routed in ascending edge-id order (plain string comparison,
 *   locale-independent); each route reserves its cells before the next edge is tried, so two
 *   routes never share a cell (no junctions in MVP).
 * - `endpoint-clearance` is never emitted: the only endpoint rule is that the connector begins
 *   and ends on an exterior face of each room, which a straight run of empty cells guarantees.
 */
export const resolveRelationships: RelationshipResolver = (doc) => {
  const byId = new Map<string, RoomNode>(doc.nodes.map((n) => [n.id, n]));
  const cells = new Map<string, CellOccupant>();
  for (const node of doc.nodes) {
    for (const cell of footprintCells(node)) cells.set(gridKey(cell), { kind: 'room', nodeId: node.id });
  }

  const order = [...doc.edges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const resolved = new Map<string, EdgeResolution>();
  for (const edge of order) {
    const a = byId.get(edge.source);
    const b = byId.get(edge.target);
    if (!a || !b) throw new Error(`resolveRelationships expects a validated document (edge "${edge.id}")`);
    const r = resolveOne(edge, a, b, cells);
    if (r.status === 'routed') {
      for (const cell of r.route.cells) cells.set(gridKey(cell), { kind: 'route', edgeId: edge.id });
    }
    resolved.set(edge.id, r);
  }

  const edges = doc.edges.map((e) => resolved.get(e.id)!);
  const occupancy: Occupancy = { cells, at: (cell: GridCoord) => cells.get(gridKey(cell)) };
  return { edges, byEdge: new Map(edges.map((r) => [r.edgeId, r])), occupancy } satisfies SpatialResolution;
};

const UNRESOLVED_MESSAGES = {
  'not-aligned': (a: string, b: string) =>
    `"${a}" and "${b}" share a storey but no straight line joins facing walls; move one room into line`,
  'blocked-by-room': (a: string, b: string) =>
    `every straight connector between "${a}" and "${b}" would pass through another room`,
  'blocked-by-route': (a: string, b: string) =>
    `every straight connector between "${a}" and "${b}" would cross a connector of another relationship`,
} as const;

function resolveOne(
  edge: RelationshipEdge,
  a: RoomNode,
  b: RoomNode,
  occupied: ReadonlyMap<string, CellOccupant>,
): EdgeResolution {
  const base = { edgeId: edge.id, kind: edge.kind } as const;
  const contact = roomContact(a, b);
  if (contact !== null) return { ...base, status: 'direct', contact, faces: sharedFaces(a, b) };

  const [aLow, aHigh] = levelRange(a);
  const [bLow, bHigh] = levelRange(b);
  if (aHigh < bLow || bHigh < aLow) {
    return {
      ...base,
      status: 'unresolved',
      reason: 'different-level',
      message: `"${a.id}" and "${b.id}" are on different storeys; vertical connections between separated rooms are not built`,
    };
  }

  const found = findStraightRoute(a, b, occupied);
  if (!found.ok) {
    return { ...base, status: 'unresolved', reason: found.reason, message: UNRESOLVED_MESSAGES[found.reason](a.id, b.id) };
  }
  const c = found.candidate;
  return {
    ...base,
    status: 'routed',
    route: { edgeId: edge.id, axis: c.axis, level: c.level, cells: c.cells, from: c.from, to: c.to, style: connectorStyleOf(edge) },
  };
}
