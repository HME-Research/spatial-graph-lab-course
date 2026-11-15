import {
  EDGE_KINDS,
  edgeGeometryRequirement,
  gridKey,
  isEdgeGeometryValid,
  isFaceAdjacent,
  isVerticalKind,
  type DesignDocument,
  type DiagramPosition,
  type EdgeKind,
  type GraphEdge,
  type GraphNode,
  type GridCoord,
} from '@app/document';
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
 * The part of a design document the diagram layout reads. Both schema v1 (`DesignDocument`) and
 * v2 (`DesignDocumentV2`) documents satisfy it, so the layout helpers serve either.
 */
export interface DiagramSource {
  readonly nodes: readonly { readonly id: string }[];
  readonly diagram: { readonly positions: Readonly<Record<string, DiagramPosition>> };
}

export const formatGrid = (g: readonly number[]): string => `[${g.join(', ')}]`;

/** Beginner-facing names for edge kinds. */
export const EDGE_KIND_LABELS: Readonly<Record<EdgeKind, string>> = {
  door: 'Door',
  open: 'Open (no wall)',
  atrium: 'Atrium (open void)',
  'vertical-access': 'Vertical access',
};

export const orientationOf = (kind: EdgeKind): 'horizontal' | 'vertical' =>
  isVerticalKind(kind) ? 'vertical' : 'horizontal';

export interface EdgeStyle {
  readonly stroke: string;
  readonly strokeWidth: number;
  /** SVG dash pattern; undefined for solid lines. Horizontal kinds are solid, vertical kinds dashed. */
  readonly strokeDasharray: string | undefined;
  readonly symbol: string;
}

const HORIZONTAL_STROKE = '#3a4756';
const VERTICAL_STROKE = '#7b4fb0';

export const EDGE_STYLES: Readonly<Record<EdgeKind, EdgeStyle>> = {
  door: { stroke: HORIZONTAL_STROKE, strokeWidth: 2, strokeDasharray: undefined, symbol: '↔' },
  open: { stroke: HORIZONTAL_STROKE, strokeWidth: 5, strokeDasharray: undefined, symbol: '↔' },
  atrium: { stroke: VERTICAL_STROKE, strokeWidth: 3, strokeDasharray: '10 5', symbol: '↕' },
  'vertical-access': { stroke: VERTICAL_STROKE, strokeWidth: 2, strokeDasharray: '2 5', symbol: '↕' },
};

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

/** Neighbour offsets tried for a new node next to an existing one: same storey first, then up/down. */
const NEIGHBOUR_OFFSETS: readonly GridCoord[] = [
  [1, 0, 0],
  [0, 1, 0],
  [-1, 0, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/**
 * A free grid cell for a new node. Next to `nearNodeId` when it has a free face-neighbour;
 * otherwise the free cell on storey 0 closest to the origin (ring search). Deterministic.
 */
export function suggestFreeCell(doc: DesignDocument, nearNodeId?: string): GridCoord {
  const occupied = new Set(doc.nodes.map((n) => gridKey(n.grid)));
  const isFree = (g: GridCoord) => !occupied.has(gridKey(g));
  const near = nearNodeId === undefined ? undefined : doc.nodes.find((n) => n.id === nearNodeId);
  if (near) {
    for (const [dx, dy, dz] of NEIGHBOUR_OFFSETS) {
      const g: GridCoord = [near.grid[0] + dx, near.grid[1] + dy, near.grid[2] + dz];
      if (isFree(g)) return g;
    }
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

export interface KindOption {
  readonly kind: EdgeKind;
  readonly valid: boolean;
}

export interface ConnectionOptions {
  readonly source: GraphNode;
  readonly target: GraphNode;
  /** All four kinds with a geometry pre-check. The app's command outcome remains authoritative. */
  readonly kinds: readonly KindOption[];
  /** An edge that already links this pair (only one relationship per pair is allowed). */
  readonly existingEdge: GraphEdge | undefined;
  /** Beginner-readable explanation when no kind is currently possible. */
  readonly reason: string | undefined;
}

/** Guidance for connecting two nodes. Returns undefined if either node is missing or they are the same. */
export function connectionOptions(
  doc: DesignDocument,
  sourceId: string,
  targetId: string,
): ConnectionOptions | undefined {
  if (sourceId === targetId) return undefined;
  const source = doc.nodes.find((n) => n.id === sourceId);
  const target = doc.nodes.find((n) => n.id === targetId);
  if (!source || !target) return undefined;
  const existingEdge = doc.edges.find(
    (e) => (e.source === sourceId && e.target === targetId) || (e.source === targetId && e.target === sourceId),
  );
  const kinds = EDGE_KINDS.map((kind) => ({
    kind,
    valid: !existingEdge && isEdgeGeometryValid(kind, source.grid, target.grid),
  }));
  let reason: string | undefined;
  if (existingEdge) {
    reason = `"${source.id}" and "${target.id}" are already connected by "${existingEdge.id}" (${existingEdge.kind}). Change its kind in the inspector instead.`;
  } else if (!isFaceAdjacent(source.grid, target.grid)) {
    reason =
      `"${source.id}" ${formatGrid(source.grid)} and "${target.id}" ${formatGrid(target.grid)} do not share a face. ` +
      `Door/open need ${edgeGeometryRequirement('door')}; atrium/vertical access need ${edgeGeometryRequirement('atrium')}.`;
  }
  return { source, target, kinds, existingEdge, reason };
}

/** Face-adjacent nodes of `nodeId` with their connection guidance, ordered by node ID. */
export function neighbourConnections(doc: DesignDocument, nodeId: string): readonly ConnectionOptions[] {
  const node = doc.nodes.find((n) => n.id === nodeId);
  if (!node) return [];
  return doc.nodes
    .filter((n) => n.id !== nodeId && isFaceAdjacent(node.grid, n.grid))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .flatMap((n) => connectionOptions(doc, nodeId, n.id) ?? []);
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

// ── Default relationship for a new connection ────────────────────────────────────────────────

/**
 * Schema v1 only: the kind a new connection gets without asking — `door` for rooms side by side,
 * `vertical-access` for rooms stacked on top of each other (the two v1 kinds that migrate to v2
 * `access`), or null when the cells do not share a face (v1 cannot store that relationship).
 * Schema v2 needs no such choice: every new relationship is `access`, touching or not.
 */
export function defaultV1ConnectionKind(a: GridCoord, b: GridCoord): EdgeKind | null {
  if (isEdgeGeometryValid('door', a, b)) return 'door';
  if (isEdgeGeometryValid('vertical-access', a, b)) return 'vertical-access';
  return null;
}

// ── New rooms in a v2 document ───────────────────────────────────────────────────────────────

/**
 * A free 1×1×1 cell for a new v2 room: beside the room `nearNodeId` (at its minimum-corner row on
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
