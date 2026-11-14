import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  defineGraphAlgorithm,
  defineNodeType,
  defineProject,
  defineSpatialAlgorithm,
  FACE_DIRECTIONS,
  neighbourCell,
  neighbours,
  uniqueId,
  type AttributesOf,
  type Graph,
  type GridCoord,
} from './index';

const graph: Graph = {
  policy: { directed: false, allowSelfLoops: false, allowParallelEdges: false },
  nodes: [{ id: 'a' }, { id: 'door-1' }, { id: 'c' }],
  edges: [
    { id: 'e-1', source: 'a', target: 'door-1' },
    { id: 'door-2', source: 'door-1', target: 'c' },
  ],
};

describe('Student API runtime helpers', () => {
  it('define helpers return their argument (algorithms gain only a scope tag)', () => {
    const project = { name: 'P' };
    expect(defineProject(project)).toBe(project);
    const type = { id: 'gallery', label: 'Gallery' };
    expect(defineNodeType(type)).toBe(type);
    const run = () => ({ kind: 'analysis' as const, nodeValues: {} });
    expect(defineGraphAlgorithm({ id: 'g', label: 'G', run })).toEqual({ id: 'g', label: 'G', run, scope: 'graph' });
    const runT = () => ({ kind: 'transformation' as const, operations: [] });
    expect(defineSpatialAlgorithm({ id: 's', label: 'S', run: runT }).scope).toBe('spatial');
  });

  it('uniqueId skips node ids, edge ids and taken ids', () => {
    expect(uniqueId(graph, 'door')).toBe('door-3');
    expect(uniqueId(graph, 'door', ['door-3'])).toBe('door-4');
    expect(uniqueId(graph, 'room')).toBe('room-1');
  });

  it('re-exports generic queries that work on plain id/endpoint graphs', () => {
    expect(neighbours(graph, 'door-1')).toEqual(['a', 'c']);
  });

  it('neighbourCell does pure grid arithmetic without mutating its input', () => {
    const cell: GridCoord = [1, 2, 3];
    expect(neighbourCell(cell, '+x')).toEqual([2, 2, 3]);
    expect(neighbourCell(cell, '-z')).toEqual([1, 2, 2]);
    expect(cell).toEqual([1, 2, 3]);
    expect(FACE_DIRECTIONS).toEqual(['+x', '-x', '+y', '-y', '+z', '-z']);
  });
});

describe('Student API compile-time inference', () => {
  it('infers typed effective attributes from a node type definition', () => {
    const gallery = defineNodeType({
      id: 'gallery',
      label: 'Gallery',
      attributes: {
        daylight: { kind: 'enum', values: ['high', 'medium', 'low'] },
        public: { kind: 'boolean', default: true },
        occupancy: { kind: 'number', min: 0 },
        note: { kind: 'text' },
      },
    });
    type A = AttributesOf<NonNullable<typeof gallery.attributes>>;
    expectTypeOf<A['daylight']>().toEqualTypeOf<'high' | 'medium' | 'low' | undefined>();
    expectTypeOf<A['public']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<A['occupancy']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<A['note']>().toEqualTypeOf<string | undefined>();
  });

  it('types algorithm parameters', () => {
    defineGraphAlgorithm({
      id: 'p',
      label: 'P',
      parameters: { start: { kind: 'text' } },
      run(ctx) {
        expectTypeOf(ctx.params.start).toEqualTypeOf<string | undefined>();
        return { kind: 'analysis', nodeValues: {} };
      },
    });
  });
});
