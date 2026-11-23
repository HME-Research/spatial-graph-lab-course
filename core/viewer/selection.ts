/**
 * Shared selection, owned by the app and identical in every view. Views never keep their own copy.
 * One node, one edge, several items (`multi`, 2026-11-23: box selection and Ctrl-click in Graph 2D),
 * or nothing. A `multi` selection always holds at least two items in total; one item is always
 * stored as `node` / `edge` (`selectItems` normalises), so single-item code keeps working.
 * Generic over any graph-like data whose nodes and edges carry whole-number IDs (as the design
 * document does since P4).
 */

/** A selectable node or edge id. */
export type ItemId = number;

export type Selection =
  | { readonly kind: 'none' }
  | { readonly kind: 'node'; readonly id: ItemId }
  | { readonly kind: 'edge'; readonly id: ItemId }
  /** Two or more items in total; both lists sorted ascending, without repeats. */
  | { readonly kind: 'multi'; readonly nodes: readonly ItemId[]; readonly edges: readonly ItemId[] };

/** Replace the shared selection. Pass NO_SELECTION to clear. */
export type SelectionHandler = (selection: Selection) => void;

/** The minimum a selectable model must expose: node and edge IDs. */
export interface SelectableItems {
  readonly nodes: readonly { readonly id: ItemId }[];
  readonly edges: readonly { readonly id: ItemId }[];
}

export const NO_SELECTION: Selection = Object.freeze({ kind: 'none' });

export const selectNode = (id: ItemId): Selection => ({ kind: 'node', id });
export const selectEdge = (id: ItemId): Selection => ({ kind: 'edge', id });

const sortedUnique = (ids: Iterable<ItemId>): ItemId[] => [...new Set(ids)].sort((a, b) => a - b);

/** The selection holding exactly these items: nothing, one node / edge, or `multi`. */
export function selectItems(nodes: Iterable<ItemId>, edges: Iterable<ItemId>): Selection {
  const n = sortedUnique(nodes);
  const e = sortedUnique(edges);
  if (n.length + e.length === 0) return NO_SELECTION;
  if (n.length === 1 && e.length === 0) return selectNode(n[0]!);
  if (e.length === 1 && n.length === 0) return selectEdge(e[0]!);
  return { kind: 'multi', nodes: n, edges: e };
}

/** The selected node ids (sorted). */
export const selectedNodeIds = (selection: Selection): readonly ItemId[] =>
  selection.kind === 'node' ? [selection.id] : selection.kind === 'multi' ? selection.nodes : [];

/** The selected edge ids (sorted). */
export const selectedEdgeIds = (selection: Selection): readonly ItemId[] =>
  selection.kind === 'edge' ? [selection.id] : selection.kind === 'multi' ? selection.edges : [];

/** Ctrl/⌘-click: add the item to the selection, or remove it when it is already selected. */
export function toggleSelected(selection: Selection, kind: 'node' | 'edge', id: ItemId): Selection {
  const nodes = new Set(selectedNodeIds(selection));
  const edges = new Set(selectedEdgeIds(selection));
  const set = kind === 'node' ? nodes : edges;
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return selectItems(nodes, edges);
}

/** The selection plus these items (a Ctrl/⌘ box selection adds to what is selected). */
export const addToSelection = (selection: Selection, nodes: Iterable<ItemId>, edges: Iterable<ItemId>): Selection =>
  selectItems([...selectedNodeIds(selection), ...nodes], [...selectedEdgeIds(selection), ...edges]);

export const isNodeSelected = (selection: Selection, nodeId: ItemId): boolean =>
  (selection.kind === 'node' && selection.id === nodeId) || (selection.kind === 'multi' && selection.nodes.includes(nodeId));

export const isEdgeSelected = (selection: Selection, edgeId: ItemId): boolean =>
  (selection.kind === 'edge' && selection.id === edgeId) || (selection.kind === 'multi' && selection.edges.includes(edgeId));

const sameIds = (a: readonly ItemId[], b: readonly ItemId[]) => a.length === b.length && a.every((id, i) => id === b[i]);

export function sameSelection(a: Selection, b: Selection): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'none') return true;
  if (a.kind === 'multi') {
    const m = b as Extract<Selection, { kind: 'multi' }>;
    return sameIds(a.nodes, m.nodes) && sameIds(a.edges, m.edges);
  }
  return a.id === (b as { id: ItemId }).id;
}

/** What a view should highlight for the shared selection. */
export interface Emphasis {
  /** Nodes to highlight strongly (the selected nodes). */
  readonly primaryNodes: ReadonlySet<ItemId>;
  /** Nodes to highlight softly (the endpoints of a single selected edge; none for a multi-selection). */
  readonly secondaryNodes: ReadonlySet<ItemId>;
  readonly edges: ReadonlySet<ItemId>;
}

const EMPTY: ReadonlySet<ItemId> = new Set();

/** What to highlight for the shared selection. Unknown IDs simply highlight nothing. */
export function selectionEmphasis(
  selection: Selection,
  edges: readonly { readonly id: ItemId; readonly source: ItemId; readonly target: ItemId }[],
): Emphasis {
  switch (selection.kind) {
    case 'none':
      return { primaryNodes: EMPTY, secondaryNodes: EMPTY, edges: EMPTY };
    case 'node':
      return { primaryNodes: new Set([selection.id]), secondaryNodes: EMPTY, edges: EMPTY };
    case 'edge': {
      const e = edges.find((x) => x.id === selection.id);
      return {
        primaryNodes: EMPTY,
        secondaryNodes: e ? new Set([e.source, e.target]) : EMPTY,
        edges: e ? new Set([e.id]) : EMPTY,
      };
    }
    case 'multi': {
      // No soft endpoint highlight: with several items it reads as "these nodes are selected too"
      // (2026-11-23), while Delete acts only on what is selected.
      const wanted = new Set(selection.edges);
      const lit = edges.filter((e) => wanted.has(e.id));
      return { primaryNodes: new Set(selection.nodes), secondaryNodes: EMPTY, edges: new Set(lit.map((e) => e.id)) };
    }
  }
}

/**
 * Drop a selection whose node/edge no longer exists in `items` (a `multi` selection keeps the
 * items that still exist). Returns the same object when still valid, so React memoisation is not disturbed.
 */
export function reconcileSelection(selection: Selection, items: SelectableItems): Selection {
  switch (selection.kind) {
    case 'none':
      return selection;
    case 'node':
      return items.nodes.some((n) => n.id === selection.id) ? selection : NO_SELECTION;
    case 'edge':
      return items.edges.some((e) => e.id === selection.id) ? selection : NO_SELECTION;
    case 'multi': {
      const nodeIds = new Set(items.nodes.map((n) => n.id));
      const edgeIds = new Set(items.edges.map((e) => e.id));
      const nodes = selection.nodes.filter((id) => nodeIds.has(id));
      const edges = selection.edges.filter((id) => edgeIds.has(id));
      return nodes.length === selection.nodes.length && edges.length === selection.edges.length ? selection : selectItems(nodes, edges);
    }
  }
}
