import type { GridCoord } from '@core/spatial';
import { DEFAULT_CELL_SIZE, spatialToThree, type CellSize } from '@core/viewer/coordinates';
import { AXIS_INDEX, type GizmoAxis, type GizmoMode, type GizmoSide } from '@core/viewer/three/gizmoMath';
import { MAX_ROOM_SIZE, type RoomSize } from '@app/document';

/**
 * Integer room placement used by the 3D editing adapter (pure). A room is its minimum-corner cell
 * `position` plus whole-cell `size`, exactly as stored in a v2 document; world positions are derived.
 */
export interface RoomGeometry {
  readonly position: GridCoord;
  readonly size: RoomSize;
}

/**
 * Geometry after `steps` whole cells along one grid axis.
 * - move: the minimum corner shifts; size unchanged.
 * - resize, side +1: the maximum face follows `steps`; the minimum corner never moves.
 * - resize, side −1: the minimum face follows `steps` (positive = towards +axis, shrinking); the
 *   maximum face never moves.
 * Sizes are clamped to 1…MAX_ROOM_SIZE.
 */
export function applyAxisSteps(
  start: RoomGeometry,
  mode: GizmoMode,
  axis: GizmoAxis,
  steps: number,
  side: GizmoSide = 1,
): RoomGeometry {
  const i = AXIS_INDEX[axis];
  const step = Math.trunc(steps) + 0;
  const corner = [...start.position] as [number, number, number];
  if (mode === 'move') {
    corner[i] = corner[i] + step;
    return { position: corner, size: start.size };
  }
  const size = [...start.size] as [number, number, number];
  const clamp = (n: number) => Math.min(MAX_ROOM_SIZE, Math.max(1, n));
  if (side === 1) {
    size[i] = clamp(size[i] + step);
    return { position: start.position, size };
  }
  size[i] = clamp(start.size[i] - step);
  corner[i] = start.position[i] + (start.size[i] - size[i]);
  return { position: corner, size };
}

export const sameGeometry = (a: RoomGeometry, b: RoomGeometry): boolean =>
  a.position[0] === b.position[0] &&
  a.position[1] === b.position[1] &&
  a.position[2] === b.position[2] &&
  a.size[0] === b.size[0] &&
  a.size[1] === b.size[1] &&
  a.size[2] === b.size[2];

/** World-space box of a room footprint (Three.js X, Y, Z extents), via `spatialToThree`. */
export function roomWorldBox(room: RoomGeometry, cell: CellSize = DEFAULT_CELL_SIZE) {
  const [gx, gy, gz] = room.position;
  const [sx, sy, sz] = room.size;
  return {
    center: spatialToThree([gx + (sx - 1) / 2, gy + (sy - 1) / 2, gz + (sz - 1) / 2], cell),
    size: [sx * cell.horizontal, sz * cell.vertical, sy * cell.horizontal] as const,
  };
}

/** "2 × 3 × 1". */
export const formatSize = (size: RoomSize): string => `${size[0]} × ${size[1]} × ${size[2]}`;
/** "[0, 4, 1]". */
export const formatGrid = (grid: GridCoord): string => `[${grid[0]}, ${grid[1]}, ${grid[2]}]`;
