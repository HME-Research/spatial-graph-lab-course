import { describe, expect, it } from 'vitest';
import { zUpToYUp } from './axes';
import { DEFAULT_CELL_SIZE, spatialToThree, type CellSize } from './coordinates';

/** Grid cell centre → continuous Z-up metres (the frame a SpatialCore/3DM model would use). */
const gridToZUpMetres = ([x, y, z]: readonly [number, number, number], cell: CellSize) =>
  [x * cell.horizontal, y * cell.horizontal, (z + 0.5) * cell.vertical] as const;

describe('zUpToYUp', () => {
  it('maps the Z-up axes onto Three.js Y-up exactly as spatialToThree does', () => {
    expect(zUpToYUp([1, 0, 0])).toEqual([1, 0, 0]); // east stays +X
    expect(zUpToYUp([0, 0, 1])).toEqual([0, 1, 0]); // up becomes +Y
    expect(zUpToYUp([0, 1, 0])).toEqual([0, 0, -1]); // north becomes -Z
    expect(zUpToYUp([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('agrees with spatialToThree for grid points (default and custom cell sizes)', () => {
    const cells: [number, number, number][] = [
      [0, 0, 0],
      [3, -2, 1],
      [-4, 5, 2],
      [0.5, 0, -0.5],
    ];
    for (const cell of [DEFAULT_CELL_SIZE, { horizontal: 2, vertical: 3.5 }]) {
      for (const g of cells) expect(zUpToYUp(gridToZUpMetres(g, cell))).toEqual(spatialToThree(g, cell));
    }
  });

  it('preserves handedness (x × y = z maps to X × Y = Z in Three)', () => {
    const [ex, ey, ez] = [zUpToYUp([1, 0, 0]), zUpToYUp([0, 1, 0]), zUpToYUp([0, 0, 1])];
    const cross = (a: readonly number[], b: readonly number[]) => [
      a[1]! * b[2]! - a[2]! * b[1]!,
      a[2]! * b[0]! - a[0]! * b[2]!,
      a[0]! * b[1]! - a[1]! * b[0]!,
    ];
    expect(cross(ex, ey).map((v) => v + 0)).toEqual([...ez]);
  });

  it('scales model units to metres and refuses invalid scales', () => {
    expect(zUpToYUp([1000, 2000, 3000], 0.001)).toEqual([1, 3, -2]);
    expect(() => zUpToYUp([1, 2, 3], 0)).toThrow(RangeError);
    expect(() => zUpToYUp([1, 2, 3], Number.NaN)).toThrow(RangeError);
  });
});
