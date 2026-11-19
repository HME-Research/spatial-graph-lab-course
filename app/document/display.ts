import type { DesignDocumentV2, RoomNode } from './schema';

/**
 * Labels and new ids (P4). A node's or edge's id is a whole number that is never reused, and it is
 * the label shown on rooms, in lists and in messages; there is no separate display id.
 */

/** Label to show for a room: its id ("3"). */
export const nodeLabel = (node: Pick<RoomNode, 'id'>): string => String(node.id);

/** The ids a document gives to its next new node and edge (the counters; `allocate…` to use them). */
export const nextNodeIdOf = (doc: Pick<DesignDocumentV2, 'nextNodeId'>): number => doc.nextNodeId;
export const nextEdgeIdOf = (doc: Pick<DesignDocumentV2, 'nextEdgeId'>): number => doc.nextEdgeId;

/**
 * "3 → 7": readable label of a relationship from its rooms' ids (source → target). Unknown edge ids
 * are returned as their number. The one helper used by Properties, the 3D editor, Undo/Redo labels
 * and algorithm previews.
 */
export function relationshipLabel(doc: Pick<DesignDocumentV2, 'edges'>, edgeId: number): string {
  const edge = doc.edges.find((e) => e.id === edgeId);
  return edge ? `${edge.source} → ${edge.target}` : String(edgeId);
}
