import { circleSegment, type Circle } from './diagram';

/**
 * Box selection in Graph 2D (2026-11-23), CAD-style. Pure; diagram coordinates throughout.
 *
 * - Dragged left → right ("window"): only items lying ENTIRELY inside the box are selected.
 * - Dragged right → left ("crossing"): every item the box touches is selected.
 *
 * Nodes are their circles; relationships are the straight segments drawn between the circles'
 * borders. The filter limits the result to nodes, relationships or both.
 */

export type BoxMode = 'window' | 'crossing';

export interface BoxFilter {
  readonly nodes: boolean;
  readonly edges: boolean;
}

export interface Box {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface BoxItems {
  readonly nodes: readonly { readonly id: number; readonly circle: Circle }[];
  readonly edges: readonly { readonly id: number; readonly source: number; readonly target: number }[];
}

/** The box between two drag points, and its mode from the drag direction. */
export function boxFromDrag(start: { x: number; y: number }, end: { x: number; y: number }): { readonly box: Box; readonly mode: BoxMode } {
  return {
    box: { minX: Math.min(start.x, end.x), minY: Math.min(start.y, end.y), maxX: Math.max(start.x, end.x), maxY: Math.max(start.y, end.y) },
    mode: end.x >= start.x ? 'window' : 'crossing',
  };
}

const inside = (box: Box, p: readonly [number, number]) => p[0] >= box.minX && p[0] <= box.maxX && p[1] >= box.minY && p[1] <= box.maxY;

function circleInside(box: Box, c: Circle): boolean {
  const [x, y] = c.centre;
  return x - c.radius >= box.minX && x + c.radius <= box.maxX && y - c.radius >= box.minY && y + c.radius <= box.maxY;
}

function circleTouches(box: Box, c: Circle): boolean {
  const [x, y] = c.centre;
  const dx = x - Math.max(box.minX, Math.min(x, box.maxX));
  const dy = y - Math.max(box.minY, Math.min(y, box.maxY));
  return dx * dx + dy * dy <= c.radius * c.radius;
}

/** Whether segment a–b meets the box (Liang–Barsky clipping). */
function segmentTouches(box: Box, a: readonly [number, number], b: readonly [number, number]): boolean {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  const checks: readonly [number, number][] = [
    [-dx, a[0] - box.minX],
    [dx, box.maxX - a[0]],
    [-dy, a[1] - box.minY],
    [dy, box.maxY - a[1]],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

/** The node and relationship ids the box selects. */
export function boxSelect(items: BoxItems, box: Box, mode: BoxMode, filter: BoxFilter): { readonly nodes: number[]; readonly edges: number[] } {
  const nodes = filter.nodes
    ? items.nodes.filter((n) => (mode === 'window' ? circleInside(box, n.circle) : circleTouches(box, n.circle))).map((n) => n.id)
    : [];
  const circles = new Map(items.nodes.map((n) => [n.id, n.circle]));
  const edges: number[] = [];
  if (filter.edges) {
    for (const e of items.edges) {
      const a = circles.get(e.source);
      const b = circles.get(e.target);
      if (!a || !b) continue;
      const { from, to } = circleSegment(a, b);
      if (mode === 'window' ? inside(box, from) && inside(box, to) : segmentTouches(box, from, to)) edges.push(e.id);
    }
  }
  return { nodes, edges };
}
