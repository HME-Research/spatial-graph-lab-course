import { FACE_DIRECTIONS, gridKey, neighbourCell, type FaceDirection, type GridCoord } from '@core/spatial';
import {
  BOUNDARY_SHIFT_DISTANCE,
  boundaryShiftOf,
  levelRange,
  roomContact,
  sharedFaces,
  type BoundaryShift,
  type DesignDocumentV2,
  type RoomNode,
  type WallStyle,
} from '@app/document';
import type { SpatialResolution } from '@app/spatial';
import type { FaceCondition, FaceSplit } from './contracts';
import { facadeOwnerOfSharedWall, representativeFaceIndex, unitFaceKey, type BuildingFace, type FaceVia } from './multicellFaces';

/**
 * Boundary shifts (2026-11-24). Pure; grid space and metres only; no React or Three.js.
 *
 * An edge may REQUEST (`boundaryShift`, stored) that the wall its two rooms share moves 1.5 m
 * (`BOUNDARY_SHIFT_DISTANCE`, half a cell) into one of them: `toward-source` into the source room,
 * `toward-target` into the target. Whether a request is APPLIED is derived here, never stored.
 * Rooms, positions, sizes, occupancy and the voxel grid stay nominal; only the architecture (Building,
 * Plan) and the actual area follow the applied shifts.
 *
 * Requests are resolved in STORED EDGE ORDER (`doc.edges`). For each edge:
 *  1. no request (`none`) → `no-request`;
 *  2. stacked rooms (vertical contact) → `stacked-rooms`; rooms spanning different storeys →
 *     `storey-mismatch` (these two never depend on other edges: the inspector disables the choice);
 *  3. the rooms must touch side by side now (`direct` horizontal resolution) → else `not-touching`;
 *  4. the shared wall must run the FULL side of the shrinking room (every storey, its whole width),
 *     in whole 3 m segments, so the shrinking room stays a box 1.5 m shallower and the growing room
 *     gains a 1.5 m strip (it may become stepped) → else `partial-wall`;
 *  5. neither room may already take part in an APPLIED shift (first applied wins) →
 *     `room-already-adjusted`;
 *  6. existing openings must survive: a generated corridor ending on a side wall of the strip, or a
 *     floor/ceiling opening (slab opening, void) in the strip, cannot be kept → `opening-conflict`;
 *  7. a wall or slab may be split by applied shifts along one axis only → `overlapping-adjustment`.
 * Otherwise the shift is applied and both rooms are reserved. A rejected request reserves nothing,
 * so a later valid request can still apply. Same document → same result.
 *
 * Overlaps with unrelated rooms cannot arise: the strip lies inside the shrinking room's own cells.
 * Doors on the side walls of the strip always fit in the remaining 1.5 m half (a door is ≤ 1.5 m).
 */

export type BoundaryShiftStatus =
  | 'applied'
  | 'no-request'
  | 'stacked-rooms'
  | 'storey-mismatch'
  | 'not-touching'
  | 'partial-wall'
  | 'room-already-adjusted'
  | 'opening-conflict'
  | 'overlapping-adjustment';

/** Statuses that come from the two rooms alone (shift choices are disabled in Properties). */
export type BoundaryShiftBlock = Extract<BoundaryShiftStatus, 'stacked-rooms' | 'storey-mismatch'>;

export interface BoundaryShiftOutcome {
  readonly edgeId: number;
  readonly requested: BoundaryShift;
  readonly status: BoundaryShiftStatus;
  /** True only when the requested shift is applied in the architecture. */
  readonly applied: boolean;
  /** Set whatever the request: why no shift can apply to this edge's rooms at all. */
  readonly blocked?: BoundaryShiftBlock;
  /** Plain-language explanation of `status`. */
  readonly message: string;
  /** The room that would lose area (requests with both rooms present). */
  readonly shrinking?: number;
  /** The room that would gain area. */
  readonly growing?: number;
}

export interface AppliedBoundaryShift {
  readonly edgeId: number;
  readonly shrinking: number;
  readonly growing: number;
  /** Horizontal direction from the shrinking room toward the growing room. */
  readonly direction: FaceDirection;
  /** The shrinking room's cells along the shared wall (half of each is given to the growing room). */
  readonly strip: readonly GridCoord[];
}

export interface BoundaryShiftResolution {
  /** One outcome per edge, in stored edge order. */
  readonly edges: readonly BoundaryShiftOutcome[];
  readonly byEdge: ReadonlyMap<number, BoundaryShiftOutcome>;
  /** Applied shifts, in stored edge order. */
  readonly applied: readonly AppliedBoundaryShift[];
  /** Node id → the applied shift it takes part in (shrinking or growing). */
  readonly byNode: ReadonlyMap<number, AppliedBoundaryShift>;
}

export const BOUNDARY_SHIFT_STATUS_TEXT: Readonly<Record<BoundaryShiftStatus, string>> = {
  applied: 'Applied',
  'no-request': 'No shift requested',
  'stacked-rooms': 'Not possible: the rooms are stacked (a floor/ceiling, not a wall)',
  'storey-mismatch': 'Not possible: the rooms span different storeys',
  'not-touching': 'Not applied: the rooms do not share a wall',
  'partial-wall': 'Not applied: the shared wall does not run the full side of the room that would shrink',
  'room-already-adjusted': 'Not applied: one of the rooms already takes part in an applied boundary shift',
  'opening-conflict': 'Not applied: an existing opening or corridor end could not be kept',
  'overlapping-adjustment': 'Not applied: it would split a wall or floor already split by another shift',
};

const OPPOSITE: Readonly<Record<FaceDirection, FaceDirection>> = {
  '+x': '-x',
  '-x': '+x',
  '+y': '-y',
  '-y': '+y',
  '+z': '-z',
  '-z': '+z',
};

const isHorizontal = (d: FaceDirection) => d !== '+z' && d !== '-z';
const axisOf = (d: FaceDirection): 'x' | 'y' | 'z' => (d === '+x' || d === '-x' ? 'x' : d === '+y' || d === '-y' ? 'y' : 'z');
const sameLevels = (a: RoomNode, b: RoomNode) => {
  const [a0, a1] = levelRange(a);
  const [b0, b1] = levelRange(b);
  return a0 === b0 && a1 === b1;
};

/** Unit-face keys of the faces an applied shift splits: the strip cells' faces across its direction. */
function splitKeys(strip: readonly GridCoord[], direction: FaceDirection): string[] {
  const keys: string[] = [];
  for (const cell of strip) for (const d of FACE_DIRECTIONS) if (axisOf(d) !== axisOf(direction)) keys.push(unitFaceKey(cell, d));
  return keys;
}

/** Why one requested shift cannot apply, before reservations; or its geometry. */
function evaluate(
  doc: DesignDocumentV2,
  spatial: SpatialResolution,
  edgeId: number,
  shrinking: RoomNode,
  growing: RoomNode,
): { readonly status: Exclude<BoundaryShiftStatus, 'applied' | 'no-request' | BoundaryShiftBlock | 'room-already-adjusted' | 'overlapping-adjustment'>; readonly detail?: string } | { readonly direction: FaceDirection; readonly strip: GridCoord[] } {
  const r = spatial.byEdge.get(edgeId);
  if (!r || r.status !== 'direct' || r.contact !== 'horizontal') return { status: 'not-touching' };
  const faces = sharedFaces(shrinking, growing);
  const direction = faces[0]?.direction;
  if (direction === undefined || !isHorizontal(direction)) return { status: 'not-touching' };
  // The whole side of the shrinking room: its width across the direction × its storeys.
  const across = axisOf(direction) === 'x' ? shrinking.size[1] : shrinking.size[0];
  if (faces.length !== across * shrinking.size[2]) return { status: 'partial-wall' };
  const strip = faces.map((f) => f.cell);
  const stripKeys = new Set(strip.map(gridKey));

  // A generated corridor ending on a side wall of the strip (its opening would straddle the new wall).
  for (const other of spatial.edges) {
    if (other.status !== 'routed') continue;
    for (const end of [other.route.from, other.route.to]) {
      if (end.nodeId === shrinking.id && stripKeys.has(gridKey(end.cell)) && axisOf(end.direction) !== axisOf(direction)) {
        return { status: 'opening-conflict', detail: `the corridor of edge ${other.edgeId} ends on a wall the shift would split` };
      }
    }
  }
  // A floor / ceiling opening (slab opening or void) of the shrinking room inside the strip.
  const slabKeys = new Set(strip.flatMap((c) => [unitFaceKey(c, '+z'), unitFaceKey(c, '-z')]));
  for (const other of spatial.edges) {
    if (other.status !== 'direct' || other.contact !== 'vertical') continue;
    const edge = doc.edges.find((e) => e.id === other.edgeId);
    if (!edge || (edge.source !== shrinking.id && edge.target !== shrinking.id)) continue;
    const built =
      other.relationship === 'access'
        ? [other.preferredFace ?? other.faces[representativeFaceIndex(other.faces)]].filter((f) => f !== undefined)
        : other.faces;
    if (built.some((f) => slabKeys.has(unitFaceKey(f.cell, f.direction)))) {
      return { status: 'opening-conflict', detail: `the floor/ceiling opening of edge ${other.edgeId} lies in the part that would move` };
    }
  }
  return { direction, strip };
}

/** Resolve every boundary-shift request of a VALIDATED document (see the module comment). */
export function resolveBoundaryShifts(doc: DesignDocumentV2, spatial: SpatialResolution): BoundaryShiftResolution {
  const byId = new Map(doc.nodes.map((n) => [n.id, n] as const));
  const reserved = new Map<number, AppliedBoundaryShift>();
  /** Unit-face key → the axis along which an applied shift splits it. */
  const splitAxis = new Map<string, 'x' | 'y'>();
  const movedKeys = new Set<string>();
  const applied: AppliedBoundaryShift[] = [];
  const edges: BoundaryShiftOutcome[] = [];

  for (const edge of doc.edges) {
    const requested = boundaryShiftOf(edge);
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) throw new Error(`resolveBoundaryShifts expects a validated document (edge "${edge.id}")`);
    const blocked: BoundaryShiftBlock | undefined =
      roomContact(source, target) === 'vertical' ? 'stacked-rooms' : !sameLevels(source, target) ? 'storey-mismatch' : undefined;
    const outcome = (status: BoundaryShiftStatus, extra: Partial<BoundaryShiftOutcome> = {}, detail?: string): BoundaryShiftOutcome => ({
      edgeId: edge.id,
      requested,
      status,
      applied: status === 'applied',
      ...(blocked ? { blocked } : {}),
      message: detail ? `${BOUNDARY_SHIFT_STATUS_TEXT[status]}: ${detail}.` : `${BOUNDARY_SHIFT_STATUS_TEXT[status]}.`,
      ...extra,
    });
    if (requested === 'none') {
      edges.push(outcome('no-request'));
      continue;
    }
    const shrinking = requested === 'toward-source' ? source : target;
    const growing = shrinking === source ? target : source;
    const rooms = { shrinking: shrinking.id, growing: growing.id };
    if (blocked) {
      edges.push(outcome(blocked, rooms));
      continue;
    }
    const geometry = evaluate(doc, spatial, edge.id, shrinking, growing);
    if ('status' in geometry) {
      edges.push(outcome(geometry.status, rooms, geometry.detail));
      continue;
    }
    const taken = reserved.get(shrinking.id) ?? reserved.get(growing.id);
    if (taken) {
      const room = reserved.has(shrinking.id) ? shrinking.id : growing.id;
      edges.push(outcome('room-already-adjusted', rooms, `room ${room} already takes part in the shift of edge ${taken.edgeId}`));
      continue;
    }
    const axis = axisOf(geometry.direction) as 'x' | 'y';
    const keys = splitKeys(geometry.strip, geometry.direction);
    const moved = geometry.strip.map((c) => unitFaceKey(c, geometry.direction));
    if (keys.some((k) => (splitAxis.has(k) && splitAxis.get(k) !== axis) || movedKeys.has(k)) || moved.some((k) => splitAxis.has(k))) {
      edges.push(outcome('overlapping-adjustment', rooms));
      continue;
    }
    const shift: AppliedBoundaryShift = { edgeId: edge.id, ...rooms, direction: geometry.direction, strip: geometry.strip };
    for (const k of keys) splitAxis.set(k, axis);
    for (const k of moved) movedKeys.add(k);
    reserved.set(shrinking.id, shift);
    reserved.set(growing.id, shift);
    applied.push(shift);
    edges.push(outcome('applied', rooms));
  }
  return { edges, byEdge: new Map(edges.map((o) => [o.edgeId, o])), applied, byNode: reserved };
}

const cache = new WeakMap<SpatialResolution, WeakMap<DesignDocumentV2, BoundaryShiftResolution>>();

/** `resolveBoundaryShifts`, memoised per (resolution, document) identity pair. */
export function boundaryShiftsOf(doc: DesignDocumentV2, spatial: SpatialResolution): BoundaryShiftResolution {
  let byDoc = cache.get(spatial);
  if (!byDoc) cache.set(spatial, (byDoc = new WeakMap()));
  let resolution = byDoc.get(doc);
  if (!resolution) byDoc.set(doc, (resolution = resolveBoundaryShifts(doc, spatial)));
  return resolution;
}

// ── Realised footprints and areas ──────────────────────────────────────────────────────────

/**
 * A horizontal rectangle in grid units where cell `i` spans `[i − 0.5, i + 0.5]` (the convention of
 * `spatialToThree`: cell centres at whole numbers). `x0 < x1`, `y0 < y1`.
 */
export interface GridRect {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

/** Fraction of a cell the boundary moves (0.5). */
const SHIFT_CELLS = 0.5;

const nominalRect = (n: Pick<RoomNode, 'position' | 'size'>): GridRect => ({
  x0: n.position[0] - 0.5,
  x1: n.position[0] + n.size[0] - 0.5,
  y0: n.position[1] - 0.5,
  y1: n.position[1] + n.size[1] - 0.5,
});

/** The half-cell strip the shrinking room gives away, as a rectangle. */
function stripRect(shrinking: Pick<RoomNode, 'position' | 'size'>, direction: FaceDirection): GridRect {
  const r = nominalRect(shrinking);
  switch (direction) {
    case '+x':
      return { ...r, x0: r.x1 - SHIFT_CELLS };
    case '-x':
      return { ...r, x1: r.x0 + SHIFT_CELLS };
    case '+y':
      return { ...r, y0: r.y1 - SHIFT_CELLS };
    default:
      return { ...r, y1: r.y0 + SHIFT_CELLS };
  }
}

/**
 * The realised plan footprint of a room (the same on each of its storeys): its nominal box, less
 * the strip it gives away or plus the strip it gains. One or two rectangles, never overlapping.
 */
export function realisedFootprint(node: Pick<RoomNode, 'id' | 'position' | 'size'>, doc: Pick<DesignDocumentV2, 'nodes'>, shifts: BoundaryShiftResolution): GridRect[] {
  const r = nominalRect(node);
  const shift = shifts.byNode.get(node.id);
  if (!shift) return [r];
  if (shift.shrinking === node.id) {
    switch (shift.direction) {
      case '+x':
        return [{ ...r, x1: r.x1 - SHIFT_CELLS }];
      case '-x':
        return [{ ...r, x0: r.x0 + SHIFT_CELLS }];
      case '+y':
        return [{ ...r, y1: r.y1 - SHIFT_CELLS }];
      default:
        return [{ ...r, y0: r.y0 + SHIFT_CELLS }];
    }
  }
  const shrinking = doc.nodes.find((n) => n.id === shift.shrinking);
  return shrinking ? [r, stripRect(shrinking, shift.direction)] : [r];
}

const rectArea = (r: GridRect) => (r.x1 - r.x0) * (r.y1 - r.y0);

/** Plan area of the nominal box in m² (the grid footprint; not summed over storeys). */
export const nominalArea = (node: Pick<RoomNode, 'size'>, cell: number): number => node.size[0] * node.size[1] * cell * cell;

/** Plan area of the realised footprint in m² (after applied boundary shifts; not summed over storeys). */
export function actualArea(node: Pick<RoomNode, 'id' | 'position' | 'size'>, doc: Pick<DesignDocumentV2, 'nodes'>, shifts: BoundaryShiftResolution, cell: number): number {
  return realisedFootprint(node, doc, shifts).reduce((sum, r) => sum + rectArea(r), 0) * cell * cell;
}

// ── Faces: the moved wall and the split halves ─────────────────────────────────────────────

/**
 * Which half of a unit face lies toward `toward` (a horizontal direction across the face), in the
 * face-local frame of `faceLayout` (walls ±y: u = grid +x; walls ±x: u = Three +Z = grid −y;
 * slabs: u = grid +x, v = Three +Z = grid −y).
 */
function halfToward(faceDirection: FaceDirection, toward: FaceDirection): Pick<FaceSplit, 'axis' | 'side'> {
  const slab = !isHorizontal(faceDirection);
  if (axisOf(toward) === 'x') return { axis: 'u', side: toward === '+x' ? 1 : -1 };
  return { axis: slab ? 'v' : 'u', side: toward === '+y' ? -1 : 1 };
}

export interface ApplyShiftsOptions {
  /** Each room's effective walls (as `resolveBuildingFaces`), for the façade-owner rule on new pairs. */
  readonly wallsOf?: (nodeId: number) => WallStyle;
}

/**
 * The faces of the realised architecture: `faces` (from `resolveBuildingFaces`) with every applied
 * shift's shared wall moved by 1.5 m (`planeOffset`) and every face beside the strip split in two
 * halves (`split`). A half given to the growing room gets the condition of its NEW pair of rooms: no
 * relationship → internal wall (or the façade wall of the enclosed room beside an open-walled one),
 * an Open relationship that is built directly → open; a slab half is a plain slab. Faces of other
 * rooms are unchanged (same objects). Order: the input order, a split face replaced by its halves.
 */
export function applyBoundaryShifts(
  faces: readonly BuildingFace[],
  doc: DesignDocumentV2,
  spatial: SpatialResolution,
  shifts: BoundaryShiftResolution,
  options: ApplyShiftsOptions = {},
): BuildingFace[] {
  if (shifts.applied.length === 0) return [...faces];
  const moved = new Map<string, AppliedBoundaryShift>();
  const splits = new Map<string, AppliedBoundaryShift[]>();
  for (const shift of shifts.applied) {
    for (const cell of shift.strip) moved.set(unitFaceKey(cell, shift.direction), shift);
    for (const key of splitKeys(shift.strip, shift.direction)) splits.set(key, [...(splits.get(key) ?? []), shift]);
  }
  const functionOf = new Map(doc.nodes.map((n) => [n.id, n.function] as const));
  const pairEdge = (a: number, b: number) =>
    doc.edges.find((e) => (e.source === a && e.target === b) || (e.source === b && e.target === a));

  const out: BuildingFace[] = [];
  for (const face of faces) {
    const key = unitFaceKey(face.cell, face.direction);
    const move = moved.get(key);
    if (move) {
      // The owner is one of the two rooms: moving into the shrinking room is against its outward
      // normal when it owns the face, along it when the growing room does.
      out.push({ ...face, planeOffset: face.ownerNodeId === move.shrinking ? -BOUNDARY_SHIFT_DISTANCE : BOUNDARY_SHIFT_DISTANCE });
      continue;
    }
    const by = splits.get(key);
    if (!by) {
      out.push(face);
      continue;
    }
    const near = by.map((s) => ({ shift: s, ...halfToward(face.direction, s.direction) }));
    const axis = near[0]!.axis;
    for (const side of [-1, 1] as const) {
      let owner = face.ownerNodeId;
      let across = face.neighbourNodeId;
      let reassigned = false;
      for (const n of near) {
        if (n.side !== side) continue;
        if (owner === n.shift.shrinking) [owner, reassigned] = [n.shift.growing, true];
        if (across === n.shift.shrinking) [across, reassigned] = [n.shift.growing, true];
      }
      const id = `${face.id}#${side < 0 ? 0 : 1}`;
      const split: FaceSplit = { axis, side, nominalFaceId: face.id, reassigned };
      if (!reassigned) {
        out.push({ ...face, id, split });
        continue;
      }
      if (across === null) {
        // Exterior, or beside a connector: the same condition, now the growing room's wall.
        out.push({ ...face, id, ownerNodeId: owner, ownerFunction: functionOf.get(owner) ?? face.ownerFunction, split });
        continue;
      }
      if (owner === across) continue; // inside one room: no element
      const wall = face.orientation === 'wall';
      let condition: FaceCondition = 'solid';
      let edgeId: number | null = null;
      let via: FaceVia = 'none';
      const edge = pairEdge(owner, across);
      const r = edge ? spatial.byEdge.get(edge.id) : undefined;
      if (wall && edge?.relationship === 'open' && r?.status === 'direct' && r.contact === 'horizontal') {
        condition = 'open';
        edgeId = edge.id;
        via = 'direct';
      }
      const facadeOwner = wall ? facadeOwnerOfSharedWall(owner, across, options.wallsOf) : null;
      if (facadeOwner !== null && condition === 'solid') condition = 'exterior';
      const author = facadeOwner ?? Math.min(owner, across);
      const flip = author !== owner;
      out.push({
        id,
        ownerNodeId: author,
        ownerFunction: functionOf.get(author) ?? face.ownerFunction,
        cell: flip ? neighbourCell(face.cell, face.direction) : face.cell,
        direction: flip ? OPPOSITE[face.direction] : face.direction,
        orientation: face.orientation,
        neighbourNodeId: flip ? owner : across,
        edgeId,
        condition,
        via,
        split,
      });
    }
  }
  return out;
}
