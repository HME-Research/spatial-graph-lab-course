import type { SpatialEdge, SpatialNode } from '@student-api';

/**
 * Small grid helpers shared by the two growing transforms.
 */

/** A cell as text, e.g. "2,-1,0", so it can be kept in a Set. */
export const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;

/**
 * Cells the app keeps for generated connectors: between two related rooms on the same level that
 * don't touch but are lined up, the app builds a straight corridor. New rooms must not take them.
 */
export function connectorCells(nodes: readonly SpatialNode[], edges: readonly SpatialEdge[]): Set<string> {
  const cells = new Set<string>();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const edge of edges) {
    const a = byId.get(edge.source);
    const b = byId.get(edge.target);
    if (a === undefined || b === undefined) continue;
    // The levels both rooms share (none: no straight connector).
    const zLo = Math.max(a.position[2], b.position[2]);
    const zHi = Math.min(a.position[2] + a.size[2], b.position[2] + b.size[2]);
    // The x and y ranges both rooms share.
    const xLo = Math.max(a.position[0], b.position[0]);
    const xHi = Math.min(a.position[0] + a.size[0], b.position[0] + b.size[0]);
    const yLo = Math.max(a.position[1], b.position[1]);
    const yHi = Math.min(a.position[1] + a.size[1], b.position[1] + b.size[1]);
    // The gap between them along y (when they line up along x), and along x (when they line up along y).
    const [low, high] = a.position[1] <= b.position[1] ? [a, b] : [b, a];
    const [left, right] = a.position[0] <= b.position[0] ? [a, b] : [b, a];
    for (let z = zLo; z < zHi; z++) {
      if (xHi > xLo) for (let y = low.position[1] + low.size[1]; y < high.position[1]; y++) for (let x = xLo; x < xHi; x++) cells.add(cellKey(x, y, z));
      if (yHi > yLo) for (let x = left.position[0] + left.size[0]; x < right.position[0]; x++) for (let y = yLo; y < yHi; y++) cells.add(cellKey(x, y, z));
    }
  }
  return cells;
}
