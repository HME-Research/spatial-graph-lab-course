import { describe, expect, it } from 'vitest';
import { serializeDesignV2, type DesignDocumentV2 } from '@app/document';
import { resolveRelationships, resolveWithPreferences } from '@app/spatial';
import { NO_SELECTION, selectEdge, selectNode } from '@core/viewer/selection';
import { METRIC_DEPENDENCIES } from './contracts';
import { METRIC_CATALOGUE } from './catalogue';
import { createMetricEvaluator } from './registry';
import { formatMetricValue, formatNumber, metricRows } from './rows';
import { canonical, DEFAULT_ENABLED_METRICS, enabledMetrics, isMetricEnabled, sanitizeEnabledMetrics, setMetricEnabled } from './selection';
import { SYSTEM_FIELDS, systemFieldRows, systemFieldValues } from './system';
import { enclosedDoc, metricCtx, metricsLabDoc } from './test-fixtures';

const table = (doc: DesignDocumentV2, metricId: string, spatial = resolveRelationships(doc)) =>
  Object.fromEntries(createMetricEvaluator().values({ doc, spatial }, metricId));

describe('metric catalogue: hand-computed values (multi-cell, multi-storey, routed, unresolved)', () => {
  const doc = metricsLabDoc();

  it('the fixture resolves as sketched', () => {
    const status = Object.fromEntries(resolveRelationships(doc).edges.map((r) => [r.edgeId, r.status]));
    expect(status).toEqual({ 1: 'direct', 2: 'routed', 3: 'unresolved', 4: 'unresolved', 5: 'unresolved' });
  });

  it('area: plan footprint at 3 m cells, not summed over storeys', () => {
    expect(table(doc, 'area')).toEqual({ 1: 36, 2: 9, 3: 9, 4: 9, 5: 9 });
  });

  it('volume: x × y × z cells × 27 m³', () => {
    expect(table(doc, 'volume')).toEqual({ 1: 216, 2: 27, 3: 27, 4: 27, 5: 27 });
  });

  it('degree: incident relationships, built or not', () => {
    expect(table(doc, 'degree')).toEqual({ 1: 3, 2: 2, 3: 3, 4: 0, 5: 2 });
  });

  it('exposed façade length: exterior unit wall faces × 3 m, summed over storeys', () => {
    // hall: storey 0 has 7 (its +x face at [1,0,0] is shared with shop), storey 1 has 8 → 15 faces.
    // shop: −x shared with hall, +x is the connector endpoint → only ±y (2).
    // cafe: −x is the connector endpoint → 3. kiosk: −y runs alongside the enclosed connector (solid) → 3.
    // loft: free-standing → 4.
    expect(table(doc, 'exposed-facade-length')).toEqual({ 1: 45, 2: 6, 3: 9, 4: 9, 5: 12 });
    expect(table(doc, 'exposed-facade-area')).toEqual({ 1: 135, 2: 18, 3: 27, 4: 27, 5: 36 });
    expect(table(doc, 'has-exterior-facade')).toEqual({ 1: true, 2: true, 3: true, 4: true, 5: true });
  });

  it('an enclosed room has no exterior façade (roof and floor do not count)', () => {
    const enclosed = enclosedDoc();
    expect(table(enclosed, 'has-exterior-facade')).toEqual({ 1: false, 2: true, 3: true, 4: true, 5: true });
    expect(table(enclosed, 'exposed-facade-length')).toEqual({ 1: 0, 2: 9, 3: 9, 4: 9, 5: 9 });
  });

  it('unresolved connections: incident relationships whose status is unresolved', () => {
    expect(table(doc, 'unresolved-connections')).toEqual({ 1: 2, 2: 0, 3: 2, 4: 0, 5: 2 });
  });

  it('edge metrics: spatial status and connector length (0 direct, cells × 3 m routed, none unresolved)', () => {
    expect(table(doc, 'resolution-status')).toEqual({ 1: 'direct', 2: 'routed', 3: 'unresolved', 4: 'unresolved', 5: 'unresolved' });
    expect(table(doc, 'route-length')).toEqual({ 1: 0, 2: 6, 3: null, 4: null, 5: null });
  });

  it('follows the resolution it is given: an unavailable preferred face makes the edge unresolved', () => {
    // hall's −x wall is not shared with shop, so e1 keeps its relationship but is not built.
    const spatial = resolveWithPreferences(doc, { 1: { nodeId: 1, offset: [0, 0, 0], direction: '-x' } });
    expect(spatial.byEdge.get(1)?.status).toBe('unresolved');
    expect(table(doc, 'unresolved-connections', spatial)).toMatchObject({ 1: 3, 2: 1 });
    expect(table(doc, 'resolution-status', spatial)).toMatchObject({ 1: 'unresolved' });
    // The hall/shop wall becomes a plain solid wall: still not exterior.
    expect(table(doc, 'exposed-facade-length', spatial)).toMatchObject({ 1: 45, 2: 6 });
  });

  it('recomputes after a graph change: removing the connector exposes the walls it touched', () => {
    const evaluator = createMetricEvaluator();
    const before = metricCtx(doc);
    expect(evaluator.value(before, 'exposed-facade-length', 2)).toBe(6);
    const withoutE2: DesignDocumentV2 = { ...doc, edges: doc.edges.filter((e) => e.id !== 2) };
    const after = metricCtx(withoutE2);
    expect(evaluator.value(after, 'exposed-facade-length', 2)).toBe(9);
    expect(evaluator.value(after, 'exposed-facade-length', 3)).toBe(12);
    expect(evaluator.value(after, 'exposed-facade-length', 4)).toBe(12);
    expect(evaluator.value(after, 'degree', 2)).toBe(1);
  });

  it('recomputes after a geometry change: stacking the loft on hall makes e3 direct', () => {
    const evaluator = createMetricEvaluator();
    expect(evaluator.value(metricCtx(doc), 'unresolved-connections', 5)).toBe(2);
    const moved: DesignDocumentV2 = { ...doc, nodes: doc.nodes.map((n) => (n.id === 5 ? { ...n, grid: [0, 0, 2] } : n)) };
    const ctx = metricCtx(moved);
    expect(ctx.spatial.byEdge.get(3)?.status).toBe('direct');
    expect(evaluator.value(ctx, 'unresolved-connections', 5)).toBe(1);
    expect(evaluator.value(ctx, 'exposed-facade-length', 5)).toBe(12);
  });

  it('every metric has a definition, a valid kind, declared dependencies, and null for unknown items', () => {
    const ctx = metricCtx(doc);
    for (const m of METRIC_CATALOGUE) {
      expect(m.definition.length, m.id).toBeGreaterThan(20);
      expect(m.dependsOn.length, m.id).toBeGreaterThan(0);
      for (const d of m.dependsOn) expect(METRIC_DEPENDENCIES).toContain(d);
      expect(m.compute(ctx, 999), m.id).toBeNull();
    }
  });

  it('is read-only and never reaches the document or its export', () => {
    const frozen = metricCtx(doc);
    const text = serializeDesignV2(frozen.doc);
    const snapshot = JSON.stringify(frozen.doc);
    const evaluator = createMetricEvaluator();
    for (const m of METRIC_CATALOGUE) evaluator.values(frozen, m.id);
    expect(JSON.stringify(frozen.doc)).toBe(snapshot);
    expect(serializeDesignV2(frozen.doc)).toBe(text);
    for (const m of METRIC_CATALOGUE) expect(text).not.toContain(m.id);
  });
});

describe('enabled metric selection (project-level list of ids)', () => {
  it('defaults are known ids in catalogue order', () => {
    expect(canonical(DEFAULT_ENABLED_METRICS)).toEqual(DEFAULT_ENABLED_METRICS);
    expect(sanitizeEnabledMetrics(undefined)).toEqual({ enabled: DEFAULT_ENABLED_METRICS, dropped: [] });
  });

  it('sanitises runtime data: unknown ids, non-strings and duplicates are dropped, order is canonical', () => {
    expect(sanitizeEnabledMetrics(['route-length', 'volume', 'volume', 'daylight', 3])).toEqual({
      enabled: ['volume', 'route-length'],
      dropped: ['daylight', '3'],
    });
    expect(sanitizeEnabledMetrics('area')).toEqual({ enabled: DEFAULT_ENABLED_METRICS, dropped: ['area'] });
    expect(sanitizeEnabledMetrics([])).toEqual({ enabled: [], dropped: [] });
  });

  it('toggles and filters by collection', () => {
    const on = setMetricEnabled(['degree'], 'area', true);
    expect(on).toEqual(['area', 'degree']);
    expect(setMetricEnabled(on, 'area', false)).toEqual(['degree']);
    expect(setMetricEnabled(on, 'unknown', true)).toEqual(['area', 'degree']);
    expect(isMetricEnabled(on, 'area')).toBe(true);
    expect(enabledMetrics(['route-length', 'area'], 'nodes').map((m) => m.id)).toEqual(['area']);
    expect(enabledMetrics(['route-length', 'area'], 'edges').map((m) => m.id)).toEqual(['route-length']);
  });
});

describe('metricRows view-model', () => {
  const ctx = metricCtx(metricsLabDoc());

  it('rows of the enabled metrics of the selected node, formatted with units', () => {
    const rows = metricRows(selectNode(1), ctx, ['volume', 'area', 'has-exterior-facade', 'route-length'], createMetricEvaluator());
    expect(rows.map((r) => [r.id, r.text])).toEqual([
      ['area', '36 m²'],
      ['volume', '216 m³'],
      ['has-exterior-facade', 'yes'],
    ]);
    expect(rows.every((r) => r.readOnly && r.definition.length > 0)).toBe(true);
  });

  it('edge rows; "no value" for an unresolved connector length; nothing for no or unknown selection', () => {
    const rows = metricRows(selectEdge(3), ctx, ['resolution-status', 'route-length', 'area']);
    expect(rows.map((r) => [r.id, r.value, r.text])).toEqual([
      ['resolution-status', 'unresolved', 'unresolved'],
      ['route-length', null, 'no value'],
    ]);
    expect(metricRows(NO_SELECTION, ctx, ['area'])).toEqual([]);
    expect(metricRows(selectNode(999), ctx, ['area'])).toEqual([]);
  });

  it('formats numbers to at most two decimals', () => {
    expect(formatNumber(1 / 3)).toBe('0.33');
    expect(formatNumber(-0)).toBe('0');
    expect(formatNumber(Number.NaN)).toBe('no value');
    expect(formatMetricValue({ unit: 'm' }, 4.5)).toBe('4.5 m');
    expect(formatMetricValue({}, 2)).toBe('2');
  });
});

describe('system fields (not metrics)', () => {
  it('Function = typeId, Level = grid[2]; a multi-storey room shows its span', () => {
    const [hall, , , , loft] = metricsLabDoc().nodes;
    expect(SYSTEM_FIELDS.map((f) => [f.id, f.label, f.source])).toEqual([
      ['function', 'Function', 'typeId'],
      ['level', 'Level', 'grid[2]'],
    ]);
    expect(systemFieldValues(hall!)).toEqual({ function: 'gallery', level: 0, topLevel: 1 });
    expect(systemFieldRows(hall!, (id) => id.toUpperCase()).map((r) => [r.id, r.value, r.text])).toEqual([
      ['function', 'gallery', 'GALLERY'],
      ['level', 0, '0–1'],
    ]);
    expect(systemFieldRows(loft!).map((r) => r.text)).toEqual(['gallery', '3']);
    expect(METRIC_CATALOGUE.some((m) => m.id === 'level' || m.id === 'function')).toBe(false);
  });
});
