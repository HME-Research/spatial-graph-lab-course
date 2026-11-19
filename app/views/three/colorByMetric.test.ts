import { describe, expect, it } from 'vitest';
import { serializeDesignV2 } from '@app/document';
import { BUILT_IN_METRICS, createMetricEvaluator, type ComputedMetric } from '@app/metrics';
import { metricCtx, metricsLabDoc } from '@app/metrics/test-fixtures';
import { projectFromLegacyDesign, serializeProjectFile } from '@app/project';
import { typeColor } from '@core/viewer/appearance';
import {
  BOOLEAN_COLORS,
  CATEGORY_PALETTE,
  colorModeFromValue,
  colorModeToValue,
  DEFAULT_COLOR_MODE,
  effectiveColorMode,
  metricColorSource,
  MISSING_COLOR,
  NUMERIC_HIGH,
  NUMERIC_LOW,
  numericColor,
  resolveColoring,
  type ColorMode,
  type MetricColorSource,
} from './colorBy';

/**
 * Colour-by a calculated value (workstream M): numbers use the sequential ramp, booleans yes/no,
 * text is categorical; values are derived on read and recomputed for every new document.
 */

const lab = () => metricCtx(metricsLabDoc());
const sourceFor = (ctx = lab(), ids?: readonly string[]) => metricColorSource(createMetricEvaluator(), ctx, ids);

describe('colour by a calculated value', () => {
  it('offers only node metrics (optionally only the enabled ones)', () => {
    expect(sourceFor().metrics.map((m) => m.id)).toEqual([
      'area',
      'volume',
      'degree',
      'has-exterior-facade',
      'exposed-facade-length',
      'exposed-facade-area',
      'unresolved-connections',
    ]);
    expect(sourceFor(lab(), ['volume', 'route-length']).metrics.map((m) => m.id)).toEqual(['volume']);
  });

  it('numeric metric: sequential ramp from min to max, legend with units', () => {
    const ctx = lab();
    const c = resolveColoring(ctx.doc.nodes, [], { kind: 'metric', metricId: 'exposed-facade-length' }, sourceFor(ctx));
    expect(c.title).toBe('Exposed façade length (m)');
    expect(c.scale).toEqual({ min: 6, max: 45 });
    expect(c.colorOf.get(2)).toBe(NUMERIC_LOW);
    expect(c.colorOf.get(1)).toBe(NUMERIC_HIGH);
    expect(c.colorOf.get(5)).toBe(numericColor(12, 6, 45));
    expect(c.legend.map((e) => [e.label, e.count])).toEqual([
      ['6 m', 1],
      ['9 m', 2],
      ['12 m', 1],
      ['45 m', 1],
    ]);
    expect(c.missing.size).toBe(0);
  });

  it('boolean metric: yes/no colours', () => {
    const doc = metricsLabDoc();
    // Wall kiosk in: rooms on every side of it on storey 0 → no exterior façade.
    const enclosed = {
      ...doc,
      nextNodeId: 9,
      nodes: [
        ...doc.nodes,
        ...([[4, 1, 0], [3, 2, 0], [2, 1, 0]] as [number, number, number][]).map((grid, i) => ({ id: 6 + i, grid, size: [1, 1, 1] as [number, number, number], typeId: 'studio', attributes: {} })),
      ],
    };
    const ctx = metricCtx(enclosed);
    const c = resolveColoring(ctx.doc.nodes, [], { kind: 'metric', metricId: 'has-exterior-facade' }, sourceFor(ctx));
    expect(c.colorOf.get(4)).toBe(BOOLEAN_COLORS.false);
    expect(c.colorOf.get(1)).toBe(BOOLEAN_COLORS.true);
    expect(c.legend).toEqual([
      { label: 'yes', color: BOOLEAN_COLORS.true, count: 7 },
      { label: 'no', color: BOOLEAN_COLORS.false, count: 1 },
    ]);
  });

  it('text metric: categorical; missing and non-finite values are "no value"', () => {
    const nodes = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }].map((n) => ({ ...n, grid: [0, 0, 0] as [number, number, number], typeId: 't', attributes: {} }));
    const values = new Map<number, string | number | null>([
      [1, 'north'],
      [2, 'south'],
      [3, null],
    ]);
    const text: MetricColorSource = { metrics: [{ id: 'side', label: 'Side', valueKind: 'text' }], values: () => values };
    const c = resolveColoring(nodes, [], { kind: 'metric', metricId: 'side' }, text);
    expect(c.colorOf.get(1)).toBe(CATEGORY_PALETTE[0]);
    expect(c.colorOf.get(2)).toBe(CATEGORY_PALETTE[1]);
    expect([...c.missing]).toEqual([3, 4]);
    expect(c.legend.at(-1)).toMatchObject({ color: MISSING_COLOR, count: 2, missing: true });

    const nan: MetricColorSource = { metrics: [{ id: 'x', label: 'X', valueKind: 'number' }], values: () => new Map([[1, Number.NaN], [2, 2]]) };
    expect([...resolveColoring(nodes.slice(0, 2), [], { kind: 'metric', metricId: 'x' }, nan).missing]).toEqual([1]);
  });

  it('falls back to type without a source or for a metric not on offer', () => {
    const ctx = lab();
    const mode: ColorMode = { kind: 'metric', metricId: 'volume' };
    const byType = resolveColoring(ctx.doc.nodes, [], DEFAULT_COLOR_MODE);
    expect(resolveColoring(ctx.doc.nodes, [], mode)).toEqual(byType);
    expect(resolveColoring(ctx.doc.nodes, [], { kind: 'metric', metricId: 'route-length' }, sourceFor(ctx))).toEqual(byType);
    expect(byType.colorOf.get(1)).toBe(typeColor('gallery'));
    expect(effectiveColorMode(mode, [], ['volume'])).toBe(mode);
    expect(effectiveColorMode(mode, [], ['area'])).toBe(DEFAULT_COLOR_MODE);
    expect(effectiveColorMode(mode, [])).toBe(DEFAULT_COLOR_MODE);
  });

  it('select values round-trip, distinct from attributes of the same name', () => {
    const metric: ColorMode = { kind: 'metric', metricId: 'area' };
    const attr: ColorMode = { kind: 'attribute', key: 'area' };
    expect(colorModeToValue(metric)).toBe('metric:area');
    expect(colorModeFromValue(colorModeToValue(metric))).toEqual(metric);
    expect(colorModeFromValue(colorModeToValue(attr))).toEqual(attr);
  });

  it('recolours after a geometry change (values are derived per document, never cached on it)', () => {
    const evaluator = createMetricEvaluator();
    const before = lab();
    const mode: ColorMode = { kind: 'metric', metricId: 'volume' };
    const c1 = resolveColoring(before.doc.nodes, [], mode, metricColorSource(evaluator, before));
    expect(c1.colorOf.get(5)).toBe(NUMERIC_LOW);
    const grown = { ...before.doc, nodes: before.doc.nodes.map((n) => (n.id === 5 ? { ...n, size: [3, 3, 1] as [number, number, number] } : n)) };
    const after = metricCtx(grown);
    const c2 = resolveColoring(after.doc.nodes, [], mode, metricColorSource(evaluator, after));
    expect(c2.colorOf.get(5)).toBe(numericColor(243, 27, 243));
    expect(c2.colorOf.get(1)).toBe(numericColor(216, 27, 243));
  });
});

describe('metric values never reach exports', () => {
  const allValues = (ctx: ReturnType<typeof lab>) => {
    const evaluator = createMetricEvaluator();
    return BUILT_IN_METRICS.flatMap((m: ComputedMetric) => [...evaluator.values(ctx, m.id).values()]);
  };

  it('serializeDesignV2 is identical before and after evaluating every metric and colouring', () => {
    const ctx = lab();
    const before = serializeDesignV2(ctx.doc);
    allValues(ctx);
    resolveColoring(ctx.doc.nodes, [], { kind: 'metric', metricId: 'exposed-facade-length' }, sourceFor(ctx));
    const after = serializeDesignV2(ctx.doc);
    expect(after).toBe(before);
    for (const m of BUILT_IN_METRICS) expect(after).not.toContain(`"${m.id}"`);
  });

  it('the project file has no metric ids or values', () => {
    const ctx = lab();
    allValues(ctx);
    const file = projectFromLegacyDesign(JSON.parse(serializeDesignV2(ctx.doc)), {
      newId: () => 'proj-m',
      newScenarioId: () => 'scn-1',
      now: () => '2026-11-16T12:00:00.000Z',
    });
    if (!file.ok) throw new Error(JSON.stringify(file.issues));
    const text = serializeProjectFile(file.value);
    for (const m of BUILT_IN_METRICS) expect(text, m.id).not.toContain(`"${m.id}"`);
    expect(text).not.toMatch(/"(calculated|metrics?)"/i);
    // The stored design is exactly the design export.
    expect(JSON.stringify(file.value.scenarios[0]!.design)).toBe(JSON.stringify(JSON.parse(serializeDesignV2(ctx.doc))));
  });
});
