import { describe, expect, it } from 'vitest';
import * as api from './index';

/**
 * Frozen Student API surface (Gate F, F-D). Every runtime export of `@student-api`, sorted.
 * Removing or renaming one breaks student projects: this list changes only by an explicit,
 * documented owner decision (docs/STUDENT-API.md), never as a side effect.
 */
describe('Student API frozen surface', () => {
  it('exports exactly the frozen runtime names', () => {
    expect(Object.keys(api).sort()).toEqual([
      'FACE_DIRECTIONS',
      'defineGraphAlgorithm',
      'defineNodeType',
      'defineProject',
      'defineSpatialAlgorithm',
      'edgesBetween',
      'getEdge',
      'getNode',
      'incidentEdges',
      'neighbourCell',
      'neighbours',
      'opposite',
      'roomCells',
      'uniqueId',
    ]);
  });

  it('every runtime export is a function except the FACE_DIRECTIONS constant', () => {
    for (const [name, value] of Object.entries(api)) {
      if (name === 'FACE_DIRECTIONS') expect(value).toEqual(['+x', '-x', '+y', '-y', '+z', '-z']);
      else expect(typeof value, name).toBe('function');
    }
  });
});
