import { isVerticalKind, type EdgeKind, type GraphEdge, type GraphNode, type GridCoord } from '../../graph';
import { DEFAULT_CELL_SIZE, spatialToThree, type CellSize, type WorldPoint } from '../coordinates';
import type { Selection } from '../selection';

/**
 * Pure scene derivation shared by the 3D views (no React, no Three.js).
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

export interface Bounds {
  readonly min: WorldPoint;
  readonly max: WorldPoint;
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

export interface CameraFit {
  readonly target: WorldPoint;
  readonly position: WorldPoint;
  readonly near: number;
  readonly far: number;
}

/** Viewing direction (from target towards camera): front-right, above. Grid +x is right, grid +y recedes. */
const VIEW_DIRECTION: WorldPoint = (() => {
  const v = [1, 0.85, 1.25];
  const l = Math.hypot(v[0]!, v[1]!, v[2]!);
  return [v[0]! / l, v[1]! / l, v[2]! / l] as const;
})();

/** Camera placement that frames `bounds` for a perspective camera with vertical field of view `fovDeg`. */
export function fitCamera(bounds: Bounds | null, fovDeg: number, cell: CellSize = DEFAULT_CELL_SIZE): CameraFit {
  const b = bounds ?? {
    min: [-cell.horizontal / 2, 0, -cell.horizontal / 2],
    max: [cell.horizontal / 2, cell.vertical, cell.horizontal / 2],
  };
  const target: WorldPoint = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
  const radius = Math.max(
    Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2,
    cell.horizontal,
  );
  // 1.25 margin keeps the scene inside narrow (split) panels too.
  const distance = (radius / Math.sin(((fovDeg / 2) * Math.PI) / 180)) * 1.25;
  return {
    target,
    position: [
      target[0] + VIEW_DIRECTION[0] * distance,
      target[1] + VIEW_DIRECTION[1] * distance,
      target[2] + VIEW_DIRECTION[2] * distance,
    ],
    near: Math.max(0.05, distance / 200),
    far: distance * 20 + radius * 4,
  };
}

export interface GroundGrid {
  readonly center: WorldPoint;
  readonly size: number;
  readonly divisions: number;
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

export interface Emphasis {
  /** Nodes to highlight strongly (the selected node). */
  readonly primaryNodes: ReadonlySet<string>;
  /** Nodes to highlight softly (endpoints of a selected edge). */
  readonly secondaryNodes: ReadonlySet<string>;
  readonly edges: ReadonlySet<string>;
}

const EMPTY: ReadonlySet<string> = new Set();

/** What to highlight for the shared selection. Unknown IDs simply highlight nothing. */
export function selectionEmphasis(selection: Selection, edges: readonly GraphEdge[]): Emphasis {
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
