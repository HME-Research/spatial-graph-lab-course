import { describe, expect, it } from 'vitest';
import { isEdgeGeometryValid, unorderedPairKey } from './adjacency';
import type { GridCoord } from './schema';

// Generic face-adjacency and gridKey tests live in core/spatial/grid.test.ts.
const o: GridCoord = [0, 0, 0];

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
  it('unorderedPairKey ignores direction', () => {
    expect(unorderedPairKey('a', 'b')).toBe(unorderedPairKey('b', 'a'));
    expect(unorderedPairKey('a', 'bc')).not.toBe(unorderedPairKey('ab', 'c'));
  });
});
