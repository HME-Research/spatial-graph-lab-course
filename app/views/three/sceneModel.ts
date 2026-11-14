import { isVerticalKind, type EdgeKind, type GraphEdge, type GraphNode, type GridCoord } from '@app/document';
import { DEFAULT_CELL_SIZE, spatialToThree, type CellSize, type WorldPoint } from '@core/viewer/coordinates';
import type { Bounds, Framing, GroundGrid } from '@core/viewer/three/viewport';

/**
 * Pure scene derivation shared by the 3D views (no React, no Three.js): grid-cell items, storeys,
 * cell bounds, what the camera frames and the ground grid for a design document.
 * Every world position comes from `spatialToThree(node.grid)`; diagram positions are never read.
 */

export interface NodeItem {
  readonly id: string;
  readonly typeId: string;
  readonly grid: GridCoord;
  /** Cell centre in Three.js world space. */
  readonly position: WorldPoint;
  /** Storey (grid z). */
  readonly level: number;
}

export interface EdgeItem {
  readonly id: string;
  readonly kind: EdgeKind;
  readonly vertical: boolean;
  readonly source: string;
  readonly target: string;
  readonly start: WorldPoint;
  readonly end: WorldPoint;
  readonly mid: WorldPoint;
  readonly length: number;
  /** Unit vector from start to end (zero vector for a degenerate edge). */
  readonly direction: WorldPoint;
}

export function buildNodeItems(nodes: readonly GraphNode[], cell: CellSize = DEFAULT_CELL_SIZE): NodeItem[] {
  return nodes.map((n) => ({
    id: n.id,
    typeId: n.typeId,
    grid: n.grid,
    position: spatialToThree(n.grid, cell),
    level: n.grid[2],
  }));
}

/** Edge segments between endpoint cell centres. Edges with a missing endpoint are skipped. */
export function buildEdgeItems(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  cell: CellSize = DEFAULT_CELL_SIZE,
): EdgeItem[] {
  const gridOf = new Map(nodes.map((n) => [n.id, n.grid] as const));
  const items: EdgeItem[] = [];
  for (const e of edges) {
    const a = gridOf.get(e.source);
    const b = gridOf.get(e.target);
    if (!a || !b) continue;
    const start = spatialToThree(a, cell);
    const end = spatialToThree(b, cell);
    const d = [end[0] - start[0], end[1] - start[1], end[2] - start[2]] as const;
    const length = Math.hypot(d[0], d[1], d[2]);
    const direction: WorldPoint = length > 0 ? [d[0] / length + 0, d[1] / length + 0, d[2] / length + 0] : [0, 0, 0];
    items.push({
      id: e.id,
      kind: e.kind,
      vertical: isVerticalKind(e.kind),
      source: e.source,
      target: e.target,
      start,
      end,
      mid: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2],
      length,
      direction,
    });
  }
  return items;
}

/** Distinct occupied storeys, ascending. */
export function storeyLevels(nodes: readonly GraphNode[]): number[] {
  return [...new Set(nodes.map((n) => n.grid[2]))].sort((a, b) => a - b);
}

/** World-space box enclosing every occupied cell (full cell extents), or null when empty. */
export function cellBounds(nodes: readonly GraphNode[], cell: CellSize = DEFAULT_CELL_SIZE): Bounds | null {
  if (nodes.length === 0) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const half = [cell.horizontal / 2, cell.vertical / 2, cell.horizontal / 2];
  for (const n of nodes) {
    const p = spatialToThree(n.grid, cell);
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i]!, p[i]! - half[i]!);
      max[i] = Math.max(max[i]!, p[i]! + half[i]!);
    }
  }
  return { min: min as unknown as WorldPoint, max: max as unknown as WorldPoint };
}

/**
 * What the camera frames: `bounds`, or one ground-storey cell at the origin for an empty document,
 * never tighter than one cell width. The canvas turns this into a camera placement for its own
 * aspect ratio (`fitCameraToBounds`).
 */
export function framingFor(bounds: Bounds | null, cell: CellSize = DEFAULT_CELL_SIZE): Framing {
  return {
    bounds: bounds ?? {
      min: [-cell.horizontal / 2, 0, -cell.horizontal / 2],
      max: [cell.horizontal / 2, cell.vertical, cell.horizontal / 2],
    },
    minRadius: cell.horizontal,
  };
}

/**
 * A ground reference grid on Y = 0 whose lines coincide with cell boundaries and that covers every
 * occupied cell (in plan) plus `margin` cells on each side.
 */
export function groundGrid(
  nodes: readonly GraphNode[],
  cell: CellSize = DEFAULT_CELL_SIZE,
  margin = 2,
): GroundGrid {
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  nodes.forEach((n, i) => {
    const [x, y] = n.grid;
    if (i === 0) [minX, maxX, minY, maxY] = [x, x, y, y];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  // Half-cell boundaries span [min - 0.5 - margin, max + 0.5 + margin]; use an even, square cell count
  // centred on a cell boundary so the GridHelper lines fall exactly on boundaries.
  const cx = Math.floor((minX + maxX) / 2) + 0.5;
  const cy = Math.floor((minY + maxY) / 2) + 0.5;
  const halfCells = Math.ceil(Math.max(cx - (minX - 0.5), maxX + 0.5 - cx, cy - (minY - 0.5), maxY + 0.5 - cy)) + margin;
  const divisions = halfCells * 2;
  const [wx, , wz] = spatialToThree([cx, cy, 0], cell);
  return { center: [wx, 0, wz], size: divisions * cell.horizontal, divisions };
}

export interface AccessGroups {
  /** Node ID → group index (0-based). Groups are numbered by their smallest node ID. */
  readonly groupOf: ReadonlyMap<string, number>;
  readonly count: number;
}

/**
 * Connected components over explicit edges only. Cells that merely touch without an edge are
 * NOT connected (acceptance F). Deterministic regardless of array order.
 */
export function accessGroups(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): AccessGroups {
  const parent = new Map(nodes.map((n) => [n.id, n.id] as const));
  const find = (id: string): string => {
    let r = id;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = id;
    while (c !== r) {
      const next = parent.get(c)!;
      parent.set(c, r);
      c = next;
    }
    return r;
  };
  for (const e of edges) {
    if (!parent.has(e.source) || !parent.has(e.target)) continue;
    const a = find(e.source);
    const b = find(e.target);
    if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
  }
  // Root is the smallest ID of each component (we always attach the larger root under the smaller).
  const roots = [...new Set(nodes.map((n) => find(n.id)))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const index = new Map(roots.map((r, i) => [r, i] as const));
  return { groupOf: new Map(nodes.map((n) => [n.id, index.get(find(n.id))!] as const)), count: roots.length };
}
