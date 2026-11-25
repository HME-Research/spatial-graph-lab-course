import { FACE_DIRECTIONS, type FaceDirection, type GridCoord } from '@core/spatial';
import type { BuildingFace } from './multicellFaces';

/**
 * Wall runs (Gate F, F-C): maximal coplanar, contiguous EXTERIOR wall faces of one room on one
 * storey — what a student perceives as "one façade wall" of a room. Pure, grid space only.
 * Shared by Building (whole-wall selection, façade edits) and Plan.
 */

export interface WallRun {
  /** Deterministic: `${ownerNodeId}:${direction}:${level}:${index}` (index along u, from 0). */
  readonly id: string;
  readonly direction: FaceDirection;
  readonly ownerNodeId: number;
  readonly conditionClass: 'exterior';
  /** Storey (grid z). */
  readonly level: number;
  /** Face ids ordered along the face-layout `u` axis (grid +x for ±y walls, grid −y for ±x walls). */
  readonly faceIds: readonly string[];
  /** Owner cell of the first face along u. */
  readonly start: GridCoord;
  /** Owner cell of the last face along u. */
  readonly end: GridCoord;
}

type WallFace = Pick<BuildingFace, 'id' | 'ownerNodeId' | 'cell' | 'direction' | 'orientation' | 'condition' | 'split'>;

/** Position of a wall face along its layout u axis (see faceLayout.ts: ±x → Three +Z = grid −y). */
const alongU = (face: WallFace): number => (face.direction === '+x' || face.direction === '-x' ? -face.cell[1] : face.cell[0]);

/** Grid coordinate of the wall plane (constant within a run). */
const planeOf = (face: WallFace): number => (face.direction === '+x' || face.direction === '-x' ? face.cell[0] : face.cell[1]);


/**
 * Group exterior wall faces into runs. Output order: owner id, storey, FACE_DIRECTIONS order,
 * then run index. Non-exterior and slab faces are ignored. Independent of input order.
 */
export function groupWallRuns(faces: readonly WallFace[]): WallRun[] {
  const groups = new Map<string, WallFace[]>();
  for (const face of faces) {
    if (face.orientation !== 'wall' || face.condition !== 'exterior') continue;
    // A half bay beside a wall moved by a boundary shift is not a whole bay of a run.
    if (face.split) continue;
    const key = JSON.stringify([face.ownerNodeId, face.cell[2], face.direction, planeOf(face)]);
    const list = groups.get(key);
    if (list) list.push(face);
    else groups.set(key, [face]);
  }

  const sortedGroups = [...groups.values()].sort((a, b) => {
    const fa = a[0]!;
    const fb = b[0]!;
    return (
      fa.ownerNodeId - fb.ownerNodeId ||
      fa.cell[2] - fb.cell[2] ||
      FACE_DIRECTIONS.indexOf(fa.direction) - FACE_DIRECTIONS.indexOf(fb.direction) ||
      planeOf(fa) - planeOf(fb)
    );
  });

  const runs: WallRun[] = [];
  const counters = new Map<string, number>();
  for (const group of sortedGroups) {
    const ordered = [...group].sort((a, b) => alongU(a) - alongU(b));
    let current: WallFace[] = [];
    const flush = () => {
      if (current.length === 0) return;
      const first = current[0]!;
      const last = current[current.length - 1]!;
      const prefix = `${first.ownerNodeId}:${first.direction}:${first.cell[2]}`;
      const index = counters.get(prefix) ?? 0;
      counters.set(prefix, index + 1);
      runs.push({
        id: `${prefix}:${index}`,
        direction: first.direction,
        ownerNodeId: first.ownerNodeId,
        conditionClass: 'exterior',
        level: first.cell[2],
        faceIds: current.map((f) => f.id),
        start: first.cell,
        end: last.cell,
      });
      current = [];
    };
    for (const face of ordered) {
      const previous = current[current.length - 1];
      if (previous && alongU(face) !== alongU(previous) + 1) flush();
      current.push(face);
    }
    flush();
  }
  return runs;
}
