import { levelRange, roomContact, sharedFaces, type RoomNode } from '@app/document/v2';
import type { EdgeResolution, RelationshipResolver, SpatialResolution } from './contracts';
import { buildOccupancy } from './occupancy';

/**
 * Relationship resolver.
 *
 * ┌ GATE 0 STUB ───────────────────────────────────────────────────────────────────────────┐
 * │ Implemented: `direct` (touching rooms) and `different-level`. NOT implemented: straight  │
 * │ connector routing — every separated same-storey pair returns `unresolved` with reason    │
 * │ `routing-unavailable`. Owner of the implementation: 02-spatial-engine (keep this         │
 * │ signature; follow the order/tie-break rules in contracts.ts).                            │
 * └─────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const resolveRelationships: RelationshipResolver = (doc) => {
  const byId = new Map<string, RoomNode>(doc.nodes.map((n) => [n.id, n]));
  const edges: EdgeResolution[] = doc.edges.map((edge) => {
    const a = byId.get(edge.source);
    const b = byId.get(edge.target);
    if (!a || !b) throw new Error(`resolveRelationships expects a validated document (edge "${edge.id}")`);
    const contact = roomContact(a, b);
    if (contact !== null) {
      return { edgeId: edge.id, kind: edge.kind, status: 'direct', contact, faces: sharedFaces(a, b) };
    }
    const [aLow, aHigh] = levelRange(a);
    const [bLow, bHigh] = levelRange(b);
    if (aHigh < bLow || bHigh < aLow) {
      return {
        edgeId: edge.id,
        kind: edge.kind,
        status: 'unresolved',
        reason: 'different-level',
        message: `"${a.id}" and "${b.id}" are on different storeys; vertical connections between separated rooms are not built`,
      };
    }
    return {
      edgeId: edge.id,
      kind: edge.kind,
      status: 'unresolved',
      reason: 'routing-unavailable',
      message: `"${a.id}" and "${b.id}" do not touch; straight connectors are not available yet`,
    };
  });
  return {
    edges,
    byEdge: new Map(edges.map((r) => [r.edgeId, r])),
    occupancy: buildOccupancy(doc, edges),
  } satisfies SpatialResolution;
};
