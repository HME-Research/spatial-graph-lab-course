import type { DesignDocumentV2, RoomNode } from './schema';

/**
 * Short user-facing display ids — FROZEN Gate 0 policy. `displayId` is stored on the node and is
 * independent of the permanent `id`: renaming, deleting, reordering, export and import never
 * renumber other nodes. Numbers are never derived from render or array order at display time.
 */

/** "01", "02", …, "99", "100". */
export const formatDisplayId = (n: number): string => String(n).padStart(2, '0');

/** Label to show for a node: its displayId, else (legacy/no displayId) its permanent id. */
export const nodeLabel = (node: Pick<RoomNode, 'id' | 'displayId'>): string => node.displayId ?? node.id;

/**
 * The display id for a newly created node: one more than the largest purely numeric displayId in
 * use (minimum "01"), skipping any taken value. Deterministic for a given document.
 */
export function nextDisplayId(doc: Pick<DesignDocumentV2, 'nodes'>): string {
  const used = new Set(doc.nodes.flatMap((n) => (n.displayId === undefined ? [] : [n.displayId])));
  let n = 1;
  for (const id of used) if (/^\d+$/.test(id)) n = Math.max(n, Number(id) + 1);
  while (used.has(formatDisplayId(n))) n++;
  return formatDisplayId(n);
}

/**
 * "01 ↔ 04": readable label of a relationship from its rooms' labels (the stored edge id stays the
 * identity; messages never show raw ids). Unknown edge ids are returned unchanged. The one helper
 * used by Properties, the 3D editor, Undo/Redo labels and algorithm previews.
 */
export function relationshipLabel(doc: Pick<DesignDocumentV2, 'nodes' | 'edges'>, edgeId: string): string {
  const edge = doc.edges.find((e) => e.id === edgeId);
  if (!edge) return edgeId;
  const room = (id: string) => {
    const node = doc.nodes.find((n) => n.id === id);
    return node ? nodeLabel(node) : id;
  };
  return `${room(edge.source)} ↔ ${room(edge.target)}`;
}
