/**
 * Reusable integer-grid mathematics. Pure, dependency-free and independent of any graph model,
 * document format or renderer.
 *
 * Convention: a cell address is `[x, y, z]` of integers and **z is up** (z is the storey/level
 * axis, x and y are horizontal). Renderers map this to their own axes (see core/viewer/coordinates).
 */

/**
 * Size of one grid cell in metres: `horizontal` along x and y, `vertical` (storey height) along z.
 * The ONE definition (docs/DECISIONS.md: 3 m × 3 m × 3 m); `core/viewer`'s `DEFAULT_CELL_SIZE` is
 * this value, and pure modules that need a length limit in metres (a corridor's width) read it here.
 */
export const GRID_CELL_SIZE: Readonly<{ horizontal: number; vertical: number }> = Object.freeze({ horizontal: 3, vertical: 3 });

/** Integer cell address `[x, y, z]`, z up. */
export type GridCoord = [number, number, number];

/** Stable string key for a grid cell, e.g. "1,0,2". */
export const gridKey = (g: GridCoord): string => `${g[0]},${g[1]},${g[2]}`;

/** Same z, exactly one step in x or y. */
export function isHorizontalFaceAdjacent(a: GridCoord, b: GridCoord): boolean {
  return a[2] === b[2] && Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
}

/** Same x/y, exactly one step in z. */
export function isVerticalFaceAdjacent(a: GridCoord, b: GridCoord): boolean {
  return a[0] === b[0] && a[1] === b[1] && Math.abs(a[2] - b[2]) === 1;
}

/** Shares a face: one of the six cardinal neighbours. */
export const isFaceAdjacent = (a: GridCoord, b: GridCoord): boolean =>
  isHorizontalFaceAdjacent(a, b) || isVerticalFaceAdjacent(a, b);

/** The six cardinal neighbour directions of a cell, in grid axes (z is up). */
export const FACE_DIRECTIONS = ['+x', '-x', '+y', '-y', '+z', '-z'] as const;
export type FaceDirection = (typeof FACE_DIRECTIONS)[number];

export const FACE_DIRECTION_OFFSETS: Readonly<Record<FaceDirection, GridCoord>> = {
  '+x': [1, 0, 0],
  '-x': [-1, 0, 0],
  '+y': [0, 1, 0],
  '-y': [0, -1, 0],
  '+z': [0, 0, 1],
  '-z': [0, 0, -1],
};

/** The neighbouring cell of `cell` in `direction`. */
export const neighbourCell = (cell: GridCoord, direction: FaceDirection): GridCoord => {
  const o = FACE_DIRECTION_OFFSETS[direction];
  return [cell[0] + o[0], cell[1] + o[1], cell[2] + o[2]];
};
