import { DEFAULT_CELL_SIZE, type CellSize, type WorldPoint } from '../coordinates';

/**
 * Pure maths for the grid-snapped 3D gizmo (no React, no Three.js). A gizmo drag is constrained to
 * one GRID axis and reported as a whole number of cell steps; world-space positions are only ever
 * a temporary preview, never stored.
 *
 * Axis directions follow `spatialToThree` (core/viewer/coordinates.ts):
 *   grid +x → three +X, grid +y → three −Z, grid +z (storey, up) → three +Y.
 */

/** A grid axis (z is up). */
export type GizmoAxis = 'x' | 'y' | 'z';
export const GIZMO_AXES: readonly GizmoAxis[] = Object.freeze(['x', 'y', 'z']);

/** `move`: translate by whole cells; `resize`: change whole-cell size, minimum corner anchored. */
export type GizmoMode = 'move' | 'resize';
/** Handles a gizmo shows: one mode's, or `gumball` (move arrows and resize cubes together, Rhino-style). */
export type GizmoHandles = GizmoMode | 'gumball';
/**
 * Face a handle sits on: +1 the maximum face, −1 the minimum face of the axis. A drag is still
 * measured along the POSITIVE axis; for resize the side says which face follows it.
 */
export type GizmoSide = 1 | -1;
/** Preview tone: normal, blocked (would be refused) or warning (needs confirmation). */
export type GizmoTone = 'normal' | 'blocked' | 'warning';

/** Index of a grid axis in a `[x, y, z]` grid tuple. */
export const AXIS_INDEX: Readonly<Record<GizmoAxis, 0 | 1 | 2>> = Object.freeze({ x: 0, y: 1, z: 2 });

/** Unit Three.js direction of the positive grid axis. */
export function gridAxisDirection(axis: GizmoAxis): WorldPoint {
  switch (axis) {
    case 'x':
      return [1, 0, 0];
    case 'y':
      return [0, 0, -1];
    case 'z':
      return [0, 1, 0];
  }
}

/** World length of one cell step along a grid axis. */
export function gridAxisCellLength(axis: GizmoAxis, cell: CellSize = DEFAULT_CELL_SIZE): number {
  return axis === 'z' ? cell.vertical : cell.horizontal;
}

/** A pointer ray in world space (direction need not be normalised). */
export interface WorldRay {
  readonly origin: WorldPoint;
  readonly direction: WorldPoint;
}

const dot = (a: WorldPoint, b: WorldPoint) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: WorldPoint, b: WorldPoint): WorldPoint => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/**
 * Below this squared sine of the ray/axis angle (≈ 0.6°) the axis is viewed end-on and a drag along
 * it is ill-defined; `axisParameter` returns null and the gizmo keeps its last snapped value.
 */
const PARALLEL_SIN2 = 1e-4;

/**
 * Parameter `t` of the point on the axis line `origin + t·direction` closest to the pointer ray
 * (in units of `direction`'s length). Null when the ray is (nearly) parallel to the axis.
 */
export function axisParameter(ray: WorldRay, origin: WorldPoint, direction: WorldPoint): number | null {
  const u = direction;
  const v = ray.direction;
  const w0 = sub(origin, ray.origin);
  const a = dot(u, u);
  const b = dot(u, v);
  const c = dot(v, v);
  if (a === 0 || c === 0) return null;
  const denom = a * c - b * b;
  if (denom <= PARALLEL_SIN2 * a * c) return null;
  const t = (b * dot(v, w0) - c * dot(u, w0)) / denom;
  return Number.isFinite(t) ? t : null;
}

/** Whole cell steps for a world distance along an axis (nearest; −0 normalised to 0). */
export function snapToSteps(distance: number, cellLength: number): number {
  if (!(cellLength > 0) || !Number.isFinite(distance)) return 0;
  return Math.round(distance / cellLength) + 0;
}

/** Short user hint for the snapping increment, e.g. "Snaps to 3 m grid". */
export function snapHint(cell: CellSize = DEFAULT_CELL_SIZE): string {
  const fmt = (n: number) => `${Number(n.toFixed(2))} m`;
  return cell.horizontal === cell.vertical
    ? `Snaps to ${fmt(cell.horizontal)} grid`
    : `Snaps to ${fmt(cell.horizontal)} × ${fmt(cell.vertical)} grid`;
}
