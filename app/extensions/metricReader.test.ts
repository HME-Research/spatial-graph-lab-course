import { describe, expect, it } from 'vitest';
import { serializeDesignV2 } from '@app/document/v2';
import { METRIC_CATALOGUE } from '@app/metrics';
import { metricsLabDoc } from '@app/metrics/test-fixtures';
import { resolveWithPreferences } from '@app/spatial';
import { defineSpatialAlgorithm, type MetricInfo, type SpatialAlgorithmContext, type SpatialOperation } from '@student-api';
import { runAlgorithm, runAlgorithmV2 } from './run';
import { expectDiagnostic, expectExtOk, labDoc, labProject } from './test-fixtures';

/**
 * Student API `ctx.metrics` (workstream M): read-only calculated values in spatial algorithms,
 * the same values the app shows, never written to the design.
 */

const ALG = 'projects/lab/algorithms/m.ts';

async function withAlgorithm(run: (ctx: SpatialAlgorithmContext) => readonly SpatialOperation[] | void) {
  return labProject({
    [ALG]: {
      default: defineSpatialAlgorithm({
        id: 'm',
        label: 'M',
        run: (ctx) => ({ kind: 'transformation', operations: run(ctx) ?? [] }),
      }),
    },
  });
}

/**
 * The documented example (docs/STUDENT-API.md): a gallery's daylight from its exposed façade length.
 * Written exactly as a student would, against `@student-api` only.
 */
const daylightFromFacade = defineSpatialAlgorithm({
  id: 'daylight-from-facade',
  label: 'Daylight from façade length',
  run(ctx) {
    const operations: SpatialOperation[] = [];
    for (const room of ctx.design.nodes) {
      if (room.typeId !== 'gallery') continue;
      const metres = ctx.metrics.value('exposed-facade-length', room.id) as number;
      const daylight = metres >= 24 ? 'high' : metres >= 12 ? 'medium' : 'low';
      operations.push({ op: 'set-node-attribute', nodeId: room.id, key: 'daylight', value: daylight });
    }
    return { kind: 'transformation', summary: `${operations.length} galleries rated`, operations };
  },
});

describe('ctx.metrics in spatial algorithms', () => {
  it('the documented example runs: values are the app’s hand-checked façade lengths', async () => {
    const project = await labProject({ 'projects/lab/algorithms/daylight-from-facade.ts': { default: daylightFromFacade } });
    const doc = metricsLabDoc();
    const preview = expectExtOk(runAlgorithmV2(doc, project, 'daylight-from-facade'));
    if (preview.kind !== 'transformation') throw new Error('expected a transformation');
    const daylight = Object.fromEntries(preview.preview.after.nodes.filter((n) => n.typeId === 'gallery').map((n) => [n.id, n.attributes.daylight]));
    expect(daylight).toEqual({ hall: 'high', loft: 'medium' }); // 45 m and 12 m
  });

  it('list() describes every catalogue metric (frozen), value() reads nodes and edges', async () => {
    let list: readonly MetricInfo[] = [];
    let read: Record<string, unknown> = {};
    const project = await withAlgorithm((ctx) => {
      list = ctx.metrics.list();
      read = {
        area: ctx.metrics.value('area', 'hall'),
        volume: ctx.metrics.value('volume', 'hall'),
        facade: ctx.metrics.value('has-exterior-facade', 'kiosk'),
        unresolved: ctx.metrics.value('unresolved-connections', 'loft'),
        status: ctx.metrics.value('resolution-status', 'e2'),
        route: ctx.metrics.value('route-length', 'e2'),
        none: ctx.metrics.value('route-length', 'e4'),
      };
    });
    expectExtOk(runAlgorithmV2(metricsLabDoc(), project, 'm'));
    expect(list.map((m) => m.id)).toEqual(METRIC_CATALOGUE.map((m) => m.id));
    expect(list.find((m) => m.id === 'volume')).toEqual({
      id: 'volume',
      label: 'Volume',
      collection: 'nodes',
      valueKind: 'number',
      unit: 'm³',
      definition: METRIC_CATALOGUE.find((m) => m.id === 'volume')!.definition,
    });
    expect(list.find((m) => m.id === 'degree')).not.toHaveProperty('unit');
    expect(Object.isFrozen(list) && list.every(Object.isFrozen)).toBe(true);
    expect(read).toEqual({ area: 36, volume: 216, facade: true, unresolved: 2, status: 'routed', route: 6, none: null });
  });

  it('uses the host resolution when given (face preferences), else resolves the document', async () => {
    const seen: unknown[] = [];
    const project = await withAlgorithm((ctx) => void seen.push(ctx.metrics.value('resolution-status', 'e1')));
    const doc = metricsLabDoc();
    expectExtOk(runAlgorithmV2(doc, project, 'm'));
    const spatial = resolveWithPreferences(doc, { e1: { nodeId: 'hall', offset: [0, 0, 0], direction: '-x' } });
    expectExtOk(runAlgorithmV2(doc, project, 'm', undefined, { spatial }));
    expect(seen).toEqual(['direct', 'unresolved']);
  });

  it('works for schema-v1 runs (read through the migrated copy)', async () => {
    let area: unknown;
    const project = await withAlgorithm((ctx) => void (area = ctx.metrics.value('area', 'g1')));
    expectExtOk(runAlgorithm(labDoc(), project, 'm'));
    expect(area).toBe(9);
  });

  it('fails the run with a diagnostic for an unknown metric or item, or the wrong collection', async () => {
    const run = async (body: (ctx: SpatialAlgorithmContext) => unknown) => {
      const project = await withAlgorithm((ctx) => void body(ctx));
      return runAlgorithmV2(metricsLabDoc(), project, 'm');
    };
    expect(expectDiagnostic(await run((c) => c.metrics.value('daylight', 'hall')), 'unknown-metric').message).toMatch(/no calculated value "daylight"/);
    expect(expectDiagnostic(await run((c) => c.metrics.value('area', 'nope')), 'unknown-node-reference').message).toMatch(/no node "nope"/);
    expect(expectDiagnostic(await run((c) => c.metrics.value('route-length', 'hall')), 'unknown-node-reference').message).toMatch(/edge value/);
  });

  it('reading metrics never changes the document', async () => {
    const doc = metricsLabDoc();
    const before = serializeDesignV2(doc);
    const project = await withAlgorithm((ctx) => {
      for (const m of ctx.metrics.list()) for (const item of m.collection === 'nodes' ? ctx.design.nodes : ctx.design.edges) ctx.metrics.value(m.id, item.id);
      expect(() => (ctx.metrics as { list: unknown }).list = () => []).toThrow();
    });
    expectExtOk(runAlgorithmV2(doc, project, 'm'));
    expect(serializeDesignV2(doc)).toBe(before);
  });
});
