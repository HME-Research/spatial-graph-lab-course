import { describe, expect, it } from 'vitest';
import {
  gridKey,
  isEdgeGeometryValid,
  isFaceAdjacent,
  isHorizontalFaceAdjacent,
  isVerticalFaceAdjacent,
  unorderedPairKey,
} from './adjacency';
import type { GridCoord } from './schema';

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

describe('edge geometry by kind (acceptance G)', () => {
  it('vertical relation A(0,0,0) to C(0,0,1) is valid', () => {
    expect(isEdgeGeometryValid('atrium', o, [0, 0, 1])).toBe(true);
    expect(isEdgeGeometryValid('vertical-access', o, [0, 0, 1])).toBe(true);
  });

  it('vertical relation to (1,0,1) is rejected', () => {
    expect(isEdgeGeometryValid('atrium', o, [1, 0, 1])).toBe(false);
    expect(isEdgeGeometryValid('vertical-access', o, [1, 0, 1])).toBe(false);
  });

  it('horizontal kinds cannot cross storeys and vertical kinds cannot run horizontally', () => {
    expect(isEdgeGeometryValid('door', o, [0, 0, 1])).toBe(false);
    expect(isEdgeGeometryValid('open', o, [0, 0, 1])).toBe(false);
    expect(isEdgeGeometryValid('atrium', o, [1, 0, 0])).toBe(false);
    expect(isEdgeGeometryValid('door', o, [1, 0, 0])).toBe(true);
    expect(isEdgeGeometryValid('open', o, [0, 1, 0])).toBe(true);
  });
});

describe('keys', () => {
  it('gridKey is stable and distinct per cell', () => {
    expect(gridKey([1, -2, 3])).toBe('1,-2,3');
    expect(gridKey([1, 2, 3])).not.toBe(gridKey([12, 3, 0]));
  });

  it('unorderedPairKey ignores direction', () => {
    expect(unorderedPairKey('a', 'b')).toBe(unorderedPairKey('b', 'a'));
    expect(unorderedPairKey('a', 'bc')).not.toBe(unorderedPairKey('ab', 'c'));
  });
});
