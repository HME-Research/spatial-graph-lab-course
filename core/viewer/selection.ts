/**
 * Shared selection, owned by the app and identical in every view.
 * v1 is single-selection: one node, one edge, or nothing. Views never keep their own copy.
 * Generic over any graph-like data whose nodes and edges carry string IDs.
 */
export type Selection =
  | { readonly kind: 'none' }
  | { readonly kind: 'node'; readonly id: string }
  | { readonly kind: 'edge'; readonly id: string };

/** Replace the shared selection. Pass NO_SELECTION to clear. */
export type SelectionHandler = (selection: Selection) => void;

/** The minimum a selectable model must expose: node and edge IDs. */
export interface SelectableItems {
  readonly nodes: readonly { readonly id: string }[];
  readonly edges: readonly { readonly id: string }[];
}

export const NO_SELECTION: Selection = Object.freeze({ kind: 'none' });

export const selectNode = (id: string): Selection => ({ kind: 'node', id });
export const selectEdge = (id: string): Selection => ({ kind: 'edge', id });

export const isNodeSelected = (selection: Selection, nodeId: string): boolean =>
  selection.kind === 'node' && selection.id === nodeId;

export const isEdgeSelected = (selection: Selection, edgeId: string): boolean =>
  selection.kind === 'edge' && selection.id === edgeId;

export const sameSelection = (a: Selection, b: Selection): boolean =>
  a.kind === b.kind && (a.kind === 'none' || a.id === (b as { id: string }).id);

/**
 * Drop a selection whose node/edge no longer exists in `items`.
 * Returns the same object when still valid, so React memoisation is not disturbed.
 */
export function reconcileSelection(selection: Selection, items: SelectableItems): Selection {
  switch (selection.kind) {
    case 'none':
      return selection;
    case 'node':
      return items.nodes.some((n) => n.id === selection.id) ? selection : NO_SELECTION;
    case 'edge':
      return items.edges.some((e) => e.id === selection.id) ? selection : NO_SELECTION;
  }
}
