import { describe, expect, it } from 'vitest';
import {
  FACE_DIRECTION_OFFSETS,
  FACE_DIRECTIONS,
  gridKey,
  isFaceAdjacent,
  isHorizontalFaceAdjacent,
  isVerticalFaceAdjacent,
  neighbourCell,
  type GridCoord,
} from './index';

const o: GridCoord = [0, 0, 0];

describe('face adjacency (z is up)', () => {
  it('horizontal: one step in x or y on the same storey', () => {
    expect(isHorizontalFaceAdjacent(o, [1, 0, 0])).toBe(true);
    expect(isHorizontalFaceAdjacent(o, [0, -1, 0])).toBe(true);
    expect(isHorizontalFaceAdjacent(o, [1, 1, 0])).toBe(false); // diagonal
    expect(isHorizontalFaceAdjacent(o, [2, 0, 0])).toBe(false); // gap
    expect(isHorizontalFaceAdjacent(o, [0, 0, 1])).toBe(false); // vertical
    expect(isHorizontalFaceAdjacent(o, o)).toBe(false); // same cell
  });

  it('vertical: same x/y, one storey apart', () => {
    expect(isVerticalFaceAdjacent(o, [0, 0, 1])).toBe(true);
    expect(isVerticalFaceAdjacent(o, [0, 0, -1])).toBe(true);
    expect(isVerticalFaceAdjacent(o, [0, 0, 2])).toBe(false);
    expect(isVerticalFaceAdjacent(o, [1, 0, 1])).toBe(false);
    expect(isVerticalFaceAdjacent(o, [1, 0, 0])).toBe(false);
  });

  it('isFaceAdjacent covers all six neighbours and nothing else', () => {
    const neighbours: GridCoord[] = [
      [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
    ];
    for (const n of neighbours) expect(isFaceAdjacent(o, n)).toBe(true);
    expect(isFaceAdjacent(o, [1, 1, 1])).toBe(false);
  });
});

describe('keys', () => {
  it('gridKey is stable and distinct per cell', () => {
    expect(gridKey([1, -2, 3])).toBe('1,-2,3');
    expect(gridKey([1, 2, 3])).not.toBe(gridKey([12, 3, 0]));
  });
});

describe('cardinal neighbours', () => {
  it('neighbourCell visits exactly the six face-adjacent cells, in FACE_DIRECTIONS order', () => {
    const c: GridCoord = [2, -1, 3];
    const cells = FACE_DIRECTIONS.map((d) => neighbourCell(c, d));
    expect(cells).toEqual([
      [3, -1, 3], [1, -1, 3], [2, 0, 3], [2, -2, 3], [2, -1, 4], [2, -1, 2],
    ]);
    for (const n of cells) expect(isFaceAdjacent(c, n)).toBe(true);
    expect(new Set(cells.map(gridKey)).size).toBe(6);
  });

  it('offsets are unit steps on a single axis', () => {
    for (const d of FACE_DIRECTIONS) {
      const off = FACE_DIRECTION_OFFSETS[d];
      expect(off.reduce((s, v) => s + Math.abs(v), 0)).toBe(1);
    }
  });
});
