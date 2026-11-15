import { gridKey, type FaceDirection, type GridCoord } from '@core/spatial';
import { footprintBox, type RoomNode } from '@app/document/v2';
import type { CellOccupant, RoomFace, UnresolvedReason } from './contracts';

/**
 * Straight connector candidates between two SEPARATED rooms that share at least one storey.
 * Pure grid maths. A candidate is a straight, axis-aligned run of cells on one storey (z) along
 * x or y, strictly between a face of `source` and the facing face of `target`. No diagonal, A*
 * or multi-segment routing (MVP).
 *
 * Ordering (frozen tie-break, docs/CONTRACTS-V2.md §4): length, then axis x before y, then lowest
 * storey, then lowest perpendicular coordinate.
 */

export interface StraightCandidate {
  readonly axis: 'x' | 'y';
  readonly level: number;
  /** The coordinate on the other horizontal axis (y for an x-connector, x for a y-connector). */
  readonly perpendicular: number;
  /** Cells ordered from the source face to the target face. Never empty. */
  readonly cells: readonly GridCoord[];
  readonly from: RoomFace;
  readonly to: RoomFace;
}

const overlapRange = (aMin: number, aMax: number, bMin: number, bMax: number): [number, number] | null => {
  const lo = Math.max(aMin, bMin);
  const hi = Math.min(aMax, bMax);
  return lo <= hi ? [lo, hi] : null;
};

/** Every straight candidate, sorted by the frozen tie-break. Empty = the rooms are not aligned. */
export function straightCandidates(source: RoomNode, target: RoomNode): StraightCandidate[] {
  const A = footprintBox(source);
  const B = footprintBox(target);
  const levels = overlapRange(A.min[2], A.max[2], B.min[2], B.max[2]);
  if (!levels) return [];
  const out: StraightCandidate[] = [];
  for (const [axisIndex, axis] of [
    [0, 'x'],
    [1, 'y'],
  ] as const) {
    const perpIndex = axisIndex === 0 ? 1 : 0;
    const perp = overlapRange(A.min[perpIndex], A.max[perpIndex], B.min[perpIndex], B.max[perpIndex]);
    if (!perp) continue;
    // Source below target along the axis: leave source by its + face; otherwise by its − face.
    let start: number; // axis coordinate of the source face cell
    let end: number; // axis coordinate of the target face cell
    let step: 1 | -1;
    if (A.max[axisIndex] < B.min[axisIndex]) {
      start = A.max[axisIndex];
      end = B.min[axisIndex];
      step = 1;
    } else if (B.max[axisIndex] < A.min[axisIndex]) {
      start = A.min[axisIndex];
      end = B.max[axisIndex];
      step = -1;
    } else continue;
    const length = Math.abs(end - start) - 1;
    if (length < 1) continue; // touching rooms are direct, never routed
    const out_: FaceDirection = `${step === 1 ? '+' : '-'}${axis}` as FaceDirection;
    const in_: FaceDirection = `${step === 1 ? '-' : '+'}${axis}` as FaceDirection;
    for (let z = levels[0]; z <= levels[1]; z++) {
      for (let p = perp[0]; p <= perp[1]; p++) {
        const at = (a: number): GridCoord => (axisIndex === 0 ? [a, p, z] : [p, a, z]);
        const cells: GridCoord[] = [];
        for (let c = start + step; c !== end; c += step) cells.push(at(c));
        out.push({
          axis,
          level: z,
          perpendicular: p,
          cells,
          from: { nodeId: source.id, cell: at(start), direction: out_ },
          to: { nodeId: target.id, cell: at(end), direction: in_ },
        });
      }
    }
  }
  return out.sort(
    (a, b) =>
      a.cells.length - b.cells.length ||
      (a.axis === b.axis ? 0 : a.axis === 'x' ? -1 : 1) ||
      a.level - b.level ||
      a.perpendicular - b.perpendicular,
  );
}

export type StraightRouteResult =
  | { readonly ok: true; readonly candidate: StraightCandidate }
  | { readonly ok: false; readonly reason: Extract<UnresolvedReason, 'not-aligned' | 'blocked-by-room' | 'blocked-by-route'> };

/**
 * The first candidate whose cells are all free in `occupied` (rooms + earlier routes).
 * Failure reason: `not-aligned` (no candidate), `blocked-by-route` (some candidate is free of
 * rooms but crosses a route), otherwise `blocked-by-room`.
 */
export function findStraightRoute(
  source: RoomNode,
  target: RoomNode,
  occupied: ReadonlyMap<string, CellOccupant>,
): StraightRouteResult {
  const candidates = straightCandidates(source, target);
  if (candidates.length === 0) return { ok: false, reason: 'not-aligned' };
  let roomFree = false;
  for (const candidate of candidates) {
    let hitRoom = false;
    let hitRoute = false;
    for (const cell of candidate.cells) {
      const o = occupied.get(gridKey(cell));
      if (o?.kind === 'room') {
        hitRoom = true;
        break;
      }
      if (o?.kind === 'route') hitRoute = true;
    }
    if (!hitRoom && !hitRoute) return { ok: true, candidate };
    if (!hitRoom) roomFree = true;
  }
  return { ok: false, reason: roomFree ? 'blocked-by-route' : 'blocked-by-room' };
}
