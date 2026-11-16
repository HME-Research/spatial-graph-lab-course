import { describe, expect, it, vi } from 'vitest';
import { expectOk } from '../document/test-fixtures';
import { serializeDesignV2, validateDocumentV2, type DesignDocumentV2 } from '../document/v2';
import { v2Raw } from '../document/v2/test-fixtures';
import { resolveRelationships } from '../spatial';
import type { ComputedMetric, MetricContext } from './contracts';
import { areaMetric, BUILT_IN_METRICS, createMetricEvaluator, degreeMetric } from './registry';

const doc = (): DesignDocumentV2 => expectOk(validateDocumentV2(v2Raw()));
const ctxOf = (d: DesignDocumentV2): MetricContext => ({ doc: d, spatial: resolveRelationships(d) });

/** The same metric with a spy on compute. */
const spied = (metric: ComputedMetric) => {
  const compute = vi.fn(metric.compute);
  return { metric: { ...metric, compute }, compute };
};

const moveNode = (d: DesignDocumentV2, id: string, grid: [number, number, number]): DesignDocumentV2 => ({
  ...d,
  nodes: d.nodes.map((n) => (n.id === id ? { ...n, grid } : n)),
});

describe('built-in metrics', () => {
  it('registers the catalogue in display order; area and degree keep their dependencies', () => {
    expect(BUILT_IN_METRICS.map((m) => m.id)).toEqual(['area', 'volume', 'degree', 'has-exterior-facade', 'exposed-facade-length', 'exposed-facade-area', 'unresolved-connections', 'resolution-status', 'route-length']);
    expect(areaMetric).toMatchObject({ collection: 'nodes', valueKind: 'number', unit: 'm²', dependsOn: ['geometry'] });
    expect(degreeMetric).toMatchObject({ collection: 'nodes', valueKind: 'number', dependsOn: ['topology'] });
  });

  it('computes footprint area at 3 m cells and incident-edge degree', () => {
    const evaluator = createMetricEvaluator();
    const ctx = ctxOf(doc());
    expect(evaluator.value(ctx, 'area', 'a')).toBe(2 * 3 * 9); // 2×3 cells
    expect(evaluator.value(ctx, 'area', 'b')).toBe(9); // default 1×1×1
    expect(evaluator.value(ctx, 'degree', 'a')).toBe(1);
    expect([...evaluator.values(ctx, 'degree')]).toEqual([
      ['a', 1],
      ['b', 1],
    ]);
    expect(evaluator.value(ctx, 'area', 'missing')).toBeNull();
    expect(() => evaluator.value(ctx, 'nope', 'a')).toThrow(/unknown metric/);
  });

  it('is deterministic: equal documents give equal values in fresh evaluators', () => {
    const run = () => {
      const ctx = ctxOf(doc());
      const evaluator = createMetricEvaluator();
      return BUILT_IN_METRICS.map((m) => [...evaluator.values(ctx, m.id)]);
    };
    expect(run()).toEqual(run());
  });

  it('rejects duplicate metric ids', () => {
    expect(() => createMetricEvaluator([areaMetric, areaMetric])).toThrow(/duplicate/);
  });
});

describe('createMetricEvaluator memoisation', () => {
  it('reuses values for the same (doc, spatial) identity', () => {
    const area = spied(areaMetric);
    const evaluator = createMetricEvaluator([area.metric]);
    const ctx = ctxOf(doc());
    evaluator.value(ctx, 'area', 'a');
    evaluator.value(ctx, 'area', 'a');
    evaluator.values(ctx, 'area');
    expect(area.compute).toHaveBeenCalledTimes(2); // a once, b once
  });

  it('recomputes area but keeps degree cached when only geometry changed', () => {
    const area = spied(areaMetric);
    const degree = spied(degreeMetric);
    const evaluator = createMetricEvaluator([area.metric, degree.metric]);
    const before = ctxOf(doc());
    expect(evaluator.value(before, 'area', 'a')).toBe(54);
    expect(evaluator.value(before, 'degree', 'a')).toBe(1);

    // Resize room a (geometry only): new doc and new spatial identities, same topology.
    const resizedDoc: DesignDocumentV2 = { ...before.doc, nodes: before.doc.nodes.map((n) => (n.id === 'a' ? { ...n, size: [1, 1, 1] } : n)) };
    const after = ctxOf(resizedDoc);
    expect(evaluator.value(after, 'area', 'a')).toBe(9);
    expect(evaluator.value(after, 'degree', 'a')).toBe(1);
    expect(area.compute).toHaveBeenCalledTimes(2);
    expect(degree.compute).toHaveBeenCalledTimes(1);

    // Moving a room is geometry as well.
    const moved = ctxOf(moveNode(resizedDoc, 'b', [7, 0, 0]));
    evaluator.value(moved, 'area', 'a');
    evaluator.value(moved, 'degree', 'a');
    expect(area.compute).toHaveBeenCalledTimes(3);
    expect(degree.compute).toHaveBeenCalledTimes(1);
  });

  it('recomputes degree when topology changes but keeps area when geometry is unchanged', () => {
    const area = spied(areaMetric);
    const degree = spied(degreeMetric);
    const evaluator = createMetricEvaluator([area.metric, degree.metric]);
    const before = ctxOf(doc());
    evaluator.value(before, 'area', 'a');
    evaluator.value(before, 'degree', 'a');
    const noEdges = ctxOf({ ...before.doc, edges: [] });
    expect(evaluator.value(noEdges, 'degree', 'a')).toBe(0);
    expect(evaluator.value(noEdges, 'area', 'a')).toBe(54);
    expect(degree.compute).toHaveBeenCalledTimes(2);
    expect(area.compute).toHaveBeenCalledTimes(1);
  });

  it('a resolution-dependent metric recomputes when only the spatial identity changes', () => {
    const routed = spied({
      id: 'resolved-edges',
      label: 'Resolved edges',
      collection: 'edges',
      valueKind: 'text',
      dependsOn: ['resolution'],
      compute: ({ spatial }, edgeId) => spatial.byEdge.get(edgeId)?.status ?? null,
    } satisfies ComputedMetric);
    const evaluator = createMetricEvaluator([routed.metric]);
    const d = doc();
    const first = evaluator.value(ctxOf(d), 'resolved-edges', 'ab');
    evaluator.value(ctxOf(d), 'resolved-edges', 'ab'); // same doc, new spatial object
    expect(routed.compute).toHaveBeenCalledTimes(2);
    expect(typeof first).toBe('string');
  });

  it('a types metric recomputes when a node type changes, not when geometry changes', () => {
    const typeOf = spied({
      id: 'type-of',
      label: 'Type',
      collection: 'nodes',
      valueKind: 'text',
      dependsOn: ['types'],
      compute: ({ doc }, nodeId) => doc.nodes.find((n) => n.id === nodeId)?.typeId ?? null,
    } satisfies ComputedMetric);
    const evaluator = createMetricEvaluator([typeOf.metric]);
    const before = doc();
    const original = evaluator.value(ctxOf(before), 'type-of', 'a');
    evaluator.value(ctxOf(moveNode(before, 'b', [7, 0, 0])), 'type-of', 'a');
    expect(typeOf.compute).toHaveBeenCalledTimes(1);
    const retyped: DesignDocumentV2 = { ...before, nodes: before.nodes.map((n) => (n.id === 'a' ? { ...n, typeId: 'other-type' } : n)) };
    expect(evaluator.value(ctxOf(retyped), 'type-of', 'a')).toBe('other-type');
    expect(original).not.toBe('other-type');
    expect(typeOf.compute).toHaveBeenCalledTimes(2);
  });

  it('an edge metric declaring topology recomputes when topology changes', () => {
    const ends = spied({
      id: 'ends',
      label: 'Ends',
      collection: 'edges',
      valueKind: 'text',
      dependsOn: ['topology'],
      compute: ({ doc }, edgeId) => {
        const e = doc.edges.find((x) => x.id === edgeId);
        return e ? `${e.source}-${e.target}-${e.kind}` : null;
      },
    } satisfies ComputedMetric);
    const evaluator = createMetricEvaluator([ends.metric]);
    const before = doc();
    const first = evaluator.value(ctxOf(before), 'ends', 'ab');
    const flipped: DesignDocumentV2 = { ...before, edges: before.edges.map((e) => (e.id === 'ab' ? { ...e, kind: e.kind === 'access' ? 'open' : 'access' } : e)) };
    const second = evaluator.value(ctxOf(flipped), 'ends', 'ab');
    expect(ends.compute).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
  });

  it('switching between two documents (scenarios) does not thrash the cache', () => {
    const area = spied(areaMetric);
    const evaluator = createMetricEvaluator([area.metric]);
    const one = ctxOf(doc());
    const two = ctxOf({ ...one.doc, nodes: one.doc.nodes.map((n) => (n.id === 'a' ? { ...n, size: [1, 1, 1] } : n)) });
    for (let i = 0; i < 5; i++) {
      evaluator.value(one, 'area', 'a');
      evaluator.value(two, 'area', 'a');
    }
    expect(area.compute).toHaveBeenCalledTimes(2);
  });

  it('rejects a metric with no declared dependency or an unknown one', () => {
    expect(() => createMetricEvaluator([{ ...areaMetric, dependsOn: [] }])).toThrow(/declares no dependencies/);
    expect(() => createMetricEvaluator([{ ...areaMetric, dependsOn: ['metadata' as never] }])).toThrow(/unknown dependency/);
  });

  it('never writes values into the document or its serialisation', () => {
    const d = doc();
    const text = serializeDesignV2(d);
    const snapshot = structuredClone(d);
    const evaluator = createMetricEvaluator();
    const ctx = ctxOf(d);
    for (const m of BUILT_IN_METRICS) evaluator.values(ctx, m.id);
    expect(d).toEqual(snapshot);
    expect(serializeDesignV2(d)).toBe(text);
    expect(text).not.toMatch(/"(area|degree)"/);
  });
});
