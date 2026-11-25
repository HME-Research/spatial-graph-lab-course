import {
  DIAGRAM_GAP_Y,
  type DesignDocumentV2,
  type DiagramPosition,
  type DiagramSource,
  footprintBox,
  type GridCoord,
  NODE_HEIGHT,
  NODE_WIDTH,
  resolveDiagramPositions,
} from '@app/document';
import type { Occupancy } from '@app/spatial';

/**
 * Pure helpers for the Graph 2D editor and inspector. No React, no React Flow, no mutation.
 *
 * Graph 2D is one abstract diagram of the whole 3D graph (all storeys). Its positions come only
 * from `doc.diagram.positions` and the fallback layout (`@app/document`, `diagramLayout.ts`);
 * this module never derives diagram positions from grid cells.
 */

export { NODE_HEIGHT, NODE_WIDTH, resolveDiagramPositions, type DiagramSource };

export const formatGrid = (g: readonly number[]): string => `[${g.join(', ')}]`;

/** Diagram position for a new node: beside `nearNodeId`, or below everything already shown. */
export function suggestDiagramPosition(doc: DiagramSource, nearNodeId?: number): DiagramPosition {
  const positions = resolveDiagramPositions(doc);
  const taken = [...positions.values()];
  const clear = (p: DiagramPosition) =>
    taken.every((q) => Math.abs(q[0] - p[0]) >= NODE_WIDTH || Math.abs(q[1] - p[1]) >= NODE_HEIGHT);
  const near = nearNodeId === undefined ? undefined : positions.get(nearNodeId);
  if (near) {
    for (let step = 1; step <= 20; step++) {
      const candidate: DiagramPosition = [near[0] + step * 40, near[1] + DIAGRAM_GAP_Y];
      if (clear(candidate)) return candidate;
    }
  }
  if (taken.length === 0) return [0, 0];
  const minX = Math.min(...taken.map((p) => p[0]));
  const maxY = Math.max(...taken.map((p) => p[1]));
  return [minX, maxY + DIAGRAM_GAP_Y];
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Point where the segment from the centre of `rect` towards `toward` leaves the rectangle.
 * Used to draw "floating" edges between node borders regardless of handle placement.
 */
export function rectBorderPoint(rect: Rect, toward: readonly [number, number]): [number, number] {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const dx = toward[0] - cx;
  const dy = toward[1] - cy;
  if (dx === 0 && dy === 0) return [cx, cy];
  const sx = dx === 0 ? Infinity : rect.width / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : rect.height / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return [cx + dx * s, cy + dy * s];
}

// ── Circular nodes ────────────────────────────────────────────────────────────────────────────

/**
 * Point on the border of a circle (centre, radius) in the direction of `toward`. Edges are drawn
 * between circle borders so they visibly attach to each node regardless of handle placement.
 * When `toward` is the centre itself, the centre is returned (there is no direction).
 */
export function circleBorderPoint(
  centre: readonly [number, number],
  radius: number,
  toward: readonly [number, number],
): [number, number] {
  const dx = toward[0] - centre[0];
  const dy = toward[1] - centre[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return [centre[0], centre[1]];
  const r = Math.max(0, radius);
  return [centre[0] + (dx / length) * r, centre[1] + (dy / length) * r];
}

export interface Circle {
  readonly centre: readonly [number, number];
  readonly radius: number;
}

/**
 * Straight segment between two circles, border to border. When the circles touch or overlap (the
 * diagram allows it) the segment falls back to the centre line so it never points backwards.
 */
export function circleSegment(a: Circle, b: Circle): { readonly from: [number, number]; readonly to: [number, number] } {
  const distance = Math.hypot(b.centre[0] - a.centre[0], b.centre[1] - a.centre[1]);
  if (distance <= a.radius + b.radius) return { from: [a.centre[0], a.centre[1]], to: [b.centre[0], b.centre[1]] };
  return { from: circleBorderPoint(a.centre, a.radius, b.centre), to: circleBorderPoint(b.centre, b.radius, a.centre) };
}

// ── New rooms ───────────────────────────────────────────────────────────────

/**
 * A free 1×1×1 cell for a new room: beside the room `nearNodeId` (at its minimum-corner row on
 * each side, same storey first, then above and below), else the free cell on storey 0 closest to
 * the origin. "Free" means no room and no generated connector occupies it. Deterministic.
 */
export function suggestFreeCellV2(doc: DesignDocumentV2, occupancy: Occupancy, nearNodeId?: number): GridCoord {
  const isFree = (g: GridCoord) => occupancy.at(g) === undefined;
  const near = nearNodeId === undefined ? undefined : doc.nodes.find((n) => n.id === nearNodeId);
  if (near) {
    const { min, max } = footprintBox(near);
    const candidates: readonly GridCoord[] = [
      [max[0] + 1, min[1], min[2]],
      [min[0], max[1] + 1, min[2]],
      [min[0] - 1, min[1], min[2]],
      [min[0], min[1] - 1, min[2]],
      [min[0], min[1], max[2] + 1],
      [min[0], min[1], min[2] - 1],
    ];
    for (const g of candidates) if (isFree(g)) return g;
  }
  for (let r = 0; ; r++) {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (Math.max(Math.abs(x), Math.abs(y)) !== r) continue;
        const g: GridCoord = [x + 0, y + 0, 0]; // `+ 0` normalises -0
        if (isFree(g)) return g;
      }
    }
  }
}
