import type { DiagramPosition, GridCoord } from '@app/document';
import { footprintBox, type DesignDocumentV2 } from '@app/document/v2';
import type { Occupancy } from '@app/spatial';

/**
 * Pure helpers for the Graph 2D editor and inspector. No React, no React Flow, no mutation.
 *
 * Graph 2D is one abstract diagram of the whole 3D graph (all storeys). Its positions come only
 * from `doc.diagram.positions`; this module never derives diagram positions from grid cells.
 */

/** Nominal node box in diagram units; used for fallback spacing and new-node placement. */
export const NODE_WIDTH = 150;
export const NODE_HEIGHT = 64;
const FALLBACK_GAP_X = 190;
const FALLBACK_GAP_Y = 110;
const FALLBACK_COLUMNS = 6;

/**
 * The part of a design document the diagram layout reads.
 */
export interface DiagramSource {
  readonly nodes: readonly { readonly id: string }[];
  readonly diagram: { readonly positions: Readonly<Record<string, DiagramPosition>> };
}

export const formatGrid = (g: readonly number[]): string => `[${g.join(', ')}]`;

/**
 * Display positions for every node: the stored diagram position when present, otherwise a
 * deterministic fallback. Fallbacks are laid out in rows below the stored positions, ordered by
 * node ID, so they are stable across renders and independent of grid cells. Nothing is written
 * to the document; a fallback only becomes stored when the user drags the node.
 */
export function resolveDiagramPositions(doc: DiagramSource): ReadonlyMap<string, DiagramPosition> {
  const result = new Map<string, DiagramPosition>();
  const missing: string[] = [];
  let minX = Infinity;
  let maxY = -Infinity;
  for (const node of doc.nodes) {
    const stored = doc.diagram.positions[node.id];
    if (stored) {
      result.set(node.id, stored);
      minX = Math.min(minX, stored[0]);
      maxY = Math.max(maxY, stored[1]);
    } else {
      missing.push(node.id);
    }
  }
  const originX = Number.isFinite(minX) ? minX : 0;
  const originY = Number.isFinite(maxY) ? maxY + FALLBACK_GAP_Y + NODE_HEIGHT : 0;
  missing.sort();
  missing.forEach((id, i) => {
    const col = i % FALLBACK_COLUMNS;
    const row = Math.floor(i / FALLBACK_COLUMNS);
    result.set(id, [originX + col * FALLBACK_GAP_X, originY + row * FALLBACK_GAP_Y]);
  });
  return result;
}

/**
 * Smallest unused ID of the form `${prefix}-N` (N ≥ 1). Matches the schema ID pattern for any
 * alphanumeric prefix and is never derived from coordinates.
 */
export function nextFreeId(prefix: string, existing: Iterable<string>): string {
  const used = new Set(existing);
  for (let n = 1; ; n++) {
    const candidate = `${prefix}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** Diagram position for a new node: beside `nearNodeId`, or below everything already shown. */
export function suggestDiagramPosition(doc: DiagramSource, nearNodeId?: string): DiagramPosition {
  const positions = resolveDiagramPositions(doc);
  const taken = [...positions.values()];
  const clear = (p: DiagramPosition) =>
    taken.every((q) => Math.abs(q[0] - p[0]) >= NODE_WIDTH || Math.abs(q[1] - p[1]) >= NODE_HEIGHT);
  const near = nearNodeId === undefined ? undefined : positions.get(nearNodeId);
  if (near) {
    for (let step = 1; step <= 20; step++) {
      const candidate: DiagramPosition = [near[0] + step * 40, near[1] + FALLBACK_GAP_Y];
      if (clear(candidate)) return candidate;
    }
  }
  if (taken.length === 0) return [0, 0];
  const minX = Math.min(...taken.map((p) => p[0]));
  const maxY = Math.max(...taken.map((p) => p[1]));
  return [minX, maxY + FALLBACK_GAP_Y];
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
export function suggestFreeCellV2(doc: DesignDocumentV2, occupancy: Occupancy, nearNodeId?: string): GridCoord {
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
