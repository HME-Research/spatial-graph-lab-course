/**
 * Shared selection, owned by the app and identical in every view.
 * v1 is single-selection: one node, one edge, or nothing. Views never keep their own copy.
 * Generic over any graph-like data whose nodes and edges carry whole-number IDs (as the design
 * document does since P4).
 */

/** A selectable node or edge id. */
export type ItemId = number;

export type Selection =
  | { readonly kind: 'none' }
  | { readonly kind: 'node'; readonly id: ItemId }
  | { readonly kind: 'edge'; readonly id: ItemId };

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

export const isNodeSelected = (selection: Selection, nodeId: ItemId): boolean =>
  selection.kind === 'node' && selection.id === nodeId;

export const isEdgeSelected = (selection: Selection, edgeId: ItemId): boolean =>
  selection.kind === 'edge' && selection.id === edgeId;

export const sameSelection = (a: Selection, b: Selection): boolean =>
  a.kind === b.kind && (a.kind === 'none' || a.id === (b as { id: ItemId }).id);

/** What a view should highlight for the shared selection. */
export interface Emphasis {
  /** Nodes to highlight strongly (the selected node). */
  readonly primaryNodes: ReadonlySet<ItemId>;
  /** Nodes to highlight softly (endpoints of a selected edge). */
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
  }
}

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
