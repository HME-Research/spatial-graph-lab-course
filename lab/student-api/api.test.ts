import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  defineGraphAlgorithm,
  defineFunction,
  defineToolkit,
  defineSpatialAlgorithm,
  FACE_DIRECTIONS,
  getEdge,
  getNode,
  incidentEdges,
  neighbourCell,
  neighbours,
  type AttributesOf,
  type Graph,
  type GridCoord,
  type ItemRef,
} from './index';

const graph: Graph = {
  policy: { directed: false, allowSelfLoops: false, allowParallelEdges: false },
  nodes: [{ id: 1 }, { id: 2 }, { id: 3 }],
  edges: [
    { id: 1, source: 1, target: 2 },
    { id: 2, source: 2, target: 3 },
  ],
};

describe('Student API runtime helpers', () => {
  it('define helpers return their argument (algorithms gain only a scope tag)', () => {
    const project = { name: 'P' };
    expect(defineToolkit(project)).toBe(project);
    const type = { id: 'gallery', label: 'Gallery' };
    expect(defineFunction(type)).toBe(type);
    const run = () => ({ kind: 'analysis' as const, value: 1 });
    expect(defineGraphAlgorithm({ id: 'g', label: 'G', inputs: [], run })).toEqual({ id: 'g', label: 'G', inputs: [], run, scope: 'graph' });
    const runT = () => ({ kind: 'transformation' as const, operations: [] });
    expect(defineSpatialAlgorithm({ id: 's', label: 'S', run: runT }).scope).toBe('spatial');
  });

  it('re-exports generic queries that work on plain id/endpoint graphs', () => {
    expect(neighbours(graph, 2)).toEqual([1, 3]);
  });

  it('graph helpers take and return whole-number ids', () => {
    expect(getNode(graph, 3)).toEqual({ id: 3 });
    expect(getNode(graph, 4)).toBeUndefined();
    expect(getEdge(graph, 2)).toEqual({ id: 2, source: 2, target: 3 });
    expect(incidentEdges(graph, 1).map((e) => e.id)).toEqual([1]);
    expect(neighbours(graph, 1)).toEqual([2]);
    // Node ids and edge ids are separate sequences: the same number names a node and an edge.
    expect(getNode(graph, 1)).toEqual({ id: 1 });
    expect(getEdge(graph, 1)?.target).toBe(2);
    expectTypeOf(neighbours(graph, 3)).toEqualTypeOf<number[]>();
    expectTypeOf<ItemRef>().toEqualTypeOf<number | string>();
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
    const gallery = defineFunction({
      id: 'gallery',
      label: 'Gallery',
      custom: {
        daylight: { kind: 'enum', values: ['high', 'medium', 'low'] },
        public: { kind: 'boolean', default: true },
        occupancy: { kind: 'number', min: 0 },
        note: { kind: 'text' },
      },
    });
    type A = AttributesOf<NonNullable<typeof gallery.custom>>;
    expectTypeOf<A['daylight']>().toEqualTypeOf<'high' | 'medium' | 'low' | undefined>();
    expectTypeOf<A['public']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<A['occupancy']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<A['note']>().toEqualTypeOf<string | undefined>();
  });

  it('types analysis inputs and results', () => {
    defineGraphAlgorithm({
      id: 'p',
      label: 'P',
      inputs: [
        { kind: 'node', label: 'From' },
        { kind: 'number', label: 'Steps', min: 1 },
      ],
      run(ctx) {
        expectTypeOf(ctx.inputs).toEqualTypeOf<readonly number[]>();
        return { kind: 'analysis', value: ctx.inputs[1] ?? 0, highlightNodes: [ctx.inputs[0] ?? 0] };
      },
    });
    // @ts-expect-error inputs are required
    defineGraphAlgorithm({ id: 'q', label: 'Q', run: () => ({ kind: 'analysis', value: 1 }) });
  });
});
