import {
  HORIZONTAL_EDGE_KINDS,
  VERTICAL_EDGE_KINDS,
  type EdgeKind,
} from './constants';
import { isHorizontalFaceAdjacent, isVerticalFaceAdjacent, type GridCoord } from '@core/spatial';

/**
 * v1 edge-kind geometry rules on top of the reusable grid mathematics in core/spatial.
 * The generic helpers are re-exported so existing `@app/document` callers keep working.
 */

/** Order-independent key for a pair of node IDs (generic; re-exported for existing callers). */
export { unorderedPairKey } from '@core/graph';
export { gridKey, isFaceAdjacent, isHorizontalFaceAdjacent, isVerticalFaceAdjacent } from '@core/spatial';

export const isHorizontalKind = (kind: EdgeKind): boolean =>
  (HORIZONTAL_EDGE_KINDS as readonly string[]).includes(kind);

export const isVerticalKind = (kind: EdgeKind): boolean =>
  (VERTICAL_EDGE_KINDS as readonly string[]).includes(kind);

/** Whether an edge of `kind` may connect cells `a` and `b`. */
export function isEdgeGeometryValid(kind: EdgeKind, a: GridCoord, b: GridCoord): boolean {
  return isHorizontalKind(kind) ? isHorizontalFaceAdjacent(a, b) : isVerticalFaceAdjacent(a, b);
}

/** Human-readable requirement for an edge kind, used in error messages. */
export function edgeGeometryRequirement(kind: EdgeKind): string {
  return isHorizontalKind(kind)
    ? 'horizontal face adjacency (same z, exactly one step in x or y)'
    : 'vertical face adjacency (same x and y, exactly one step in z)';
}
