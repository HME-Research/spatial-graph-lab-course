import {
  HORIZONTAL_EDGE_KINDS,
  VERTICAL_EDGE_KINDS,
  type EdgeKind,
} from './constants';
import type { GridCoord } from './schema';

/** Order-independent key for a pair of node IDs (generic; re-exported for existing callers). */
export { unorderedPairKey } from '../graph';

/** Stable string key for a grid cell, e.g. "1,0,2". */
export const gridKey = (g: GridCoord): string => `${g[0]},${g[1]},${g[2]}`;

/** Same storey (z), exactly one step in x or y. */
export function isHorizontalFaceAdjacent(a: GridCoord, b: GridCoord): boolean {
  return a[2] === b[2] && Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
}

/** Same x/y, exactly one storey apart in z. */
export function isVerticalFaceAdjacent(a: GridCoord, b: GridCoord): boolean {
  return a[0] === b[0] && a[1] === b[1] && Math.abs(a[2] - b[2]) === 1;
}

export const isFaceAdjacent = (a: GridCoord, b: GridCoord): boolean =>
  isHorizontalFaceAdjacent(a, b) || isVerticalFaceAdjacent(a, b);

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
