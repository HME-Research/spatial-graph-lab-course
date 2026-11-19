/**
 * The ONE mapping from spatial grid coordinates to Three.js world coordinates.
 * Pure: no Three.js import, so resolvers and tests can use it without WebGL.
 *
 * Grid convention (document, see core/spatial/schema.ts): [x, y, z], integers, **z is up** (storey).
 * Three.js convention: **Y is up**, right-handed.
 *
 *   three.X =  grid.x            * cell.horizontal
 *   three.Y = (grid.z + 0.5)     * cell.vertical      (ground storey z = 0 stands on Y = 0)
 *   three.Z = -grid.y            * cell.horizontal    (keeps the frame right-handed)
 *
 * A grid coordinate addresses the CENTRE of a cell. Fractional inputs are allowed for derived
 * points: the face between [0,0,0] and [1,0,0] is at grid [0.5, 0, 0]; the floor of storey z
 * is at grid z - 0.5, its ceiling at z + 0.5.
 */

import { GRID_CELL_SIZE } from '@core/spatial';

export interface CellSize {
  /** Cell width along grid x and grid y, in metres (= Three.js units). */
  readonly horizontal: number;
  /** Storey height along grid z, in metres. */
  readonly vertical: number;
}

/** Central default from docs/DECISIONS.md: 3 m × 3 m × 3 m, defined once as `GRID_CELL_SIZE` (core/spatial). */
export const DEFAULT_CELL_SIZE: CellSize = GRID_CELL_SIZE;

/** A Three.js position as a plain tuple; pass to R3F `position` or `new Vector3(...p)`. */
export type WorldPoint = readonly [x: number, y: number, z: number];

/** Grid point (integer cell centre, or fractional derived point) → Three.js world point. */
export function spatialToThree(
  grid: readonly [number, number, number],
  cell: CellSize = DEFAULT_CELL_SIZE,
): WorldPoint {
  const [x, y, z] = grid;
  // `+ 0` normalises -0 to 0 so results compare cleanly.
  return [x * cell.horizontal + 0, (z + 0.5) * cell.vertical + 0, -y * cell.horizontal + 0];
}
