/**
 * Graph 2D edges after a project opens (Bug B, 2026-11-20).
 *
 * React Flow draws an edge only when both end nodes are "initialised": they have a size AND their
 * handle bounds were measured from the DOM. Graph 2D passes controlled nodes and feeds React
 * Flow's size measurements back through its own state (the `measured` overlay), so a rebuilt node
 * list keeps its size. Reproduced headlessly (restore from Recent, ≈ 1 in 2): React Flow measures
 * the new nodes (size + handles), then, before the overlay update is rendered, an unrelated
 * re-render hands it the node list again WITHOUT `measured`. React Flow then resets size and
 * handles to "unmeasured", and the overlay arrives one render later with the size only. The nodes
 * are drawn (they have a size), but their handles stay unmeasured: React Flow re-observes a node
 * only when its "initialised" flag changes, which it never did between two renders, and the
 * browser reports no new resize because the size did not change. No edge is drawn until the view
 * is remounted.
 *
 * The repair: the ids of nodes in exactly that state (sized, visible, no handle bounds) are
 * selected from the React Flow store, and Graph 2D asks React Flow to measure them again
 * (`useUpdateNodeInternals`). Nodes that were never measured are left to React Flow's own resize
 * observer, so the normal first measurement is untouched.
 */

/** The part of a React Flow internal node read here. */
export interface MeasuredNodeLike {
  readonly id: string;
  readonly hidden?: boolean | undefined;
  readonly measured?: { readonly width?: number | undefined; readonly height?: number | undefined } | undefined;
  readonly internals: { readonly handleBounds?: unknown };
}

/**
 * Ids (comma-joined, in lookup order; '' when none) of nodes that have a size but no measured
 * handle bounds. A string, so a store selector returning it only changes when the set changes.
 */
export function nodesMissingHandles(nodes: Iterable<MeasuredNodeLike>): string {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.hidden) continue;
    const sized = !!(node.measured?.width && node.measured?.height);
    if (sized && node.internals.handleBounds === undefined) ids.push(node.id);
  }
  return ids.join(',');
}
