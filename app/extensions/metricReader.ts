import type { DesignDocumentV2 } from '@app/document';
import { defaultMetricEvaluator, type CatalogueMetric, type MetricContext, type MetricEvaluator } from '@app/metrics';
import { resolveRelationships, type SpatialResolution } from '@app/spatial';
import type { MetricInfo, MetricReader } from '@student-api';

/**
 * `ctx.metrics` of a spatial algorithm context: read-only calculated values over the document the
 * run started from. The resolution is the host's (with the scenario's face preferences) when
 * given, otherwise `resolveRelationships(doc)`; it is computed lazily, on the first value read,
 * so algorithms that never read metrics pay nothing. Only primitives and frozen copies leave
 * this reader, so nothing an algorithm does can reach the document or the evaluator's cache.
 */
/** Every calculated value the app offers, as algorithms see it (`ctx.metrics.list()`). */
export function metricInfos(evaluator: MetricEvaluator = defaultMetricEvaluator): readonly MetricInfo[] {
  return Object.freeze(
    evaluator.metrics.map((m) =>
      Object.freeze({
        id: m.id,
        label: m.label,
        collection: m.collection,
        valueKind: m.valueKind,
        ...(m.unit !== undefined && { unit: m.unit }),
        definition: (m as Partial<CatalogueMetric>).definition ?? '',
      }),
    ),
  );
}

export function createMetricReader(
  doc: DesignDocumentV2,
  spatial: SpatialResolution | undefined,
  fail: (code: 'unknown-metric' | 'unknown-node-reference', message: string) => Error,
  evaluator: MetricEvaluator = defaultMetricEvaluator,
): MetricReader {
  const infos = metricInfos(evaluator);
  const byId = new Map(evaluator.metrics.map((m) => [m.id, m] as const));
  const nodeIds = new Set(doc.nodes.map((n) => n.id));
  const edgeIds = new Set(doc.edges.map((e) => e.id));
  let ctx: MetricContext | undefined;

  return Object.freeze({
    list: () => infos,
    value(metricId: string, itemId: number) {
      const metric = typeof metricId === 'string' ? byId.get(metricId) : undefined;
      if (!metric) {
        throw fail('unknown-metric', `metrics.value: there is no calculated value "${String(metricId)}" (see ctx.metrics.list())`);
      }
      const ids = metric.collection === 'nodes' ? nodeIds : edgeIds;
      if (typeof itemId !== 'number' || !ids.has(itemId)) {
        const what = metric.collection === 'nodes' ? 'node' : 'edge';
        throw fail('unknown-node-reference', `metrics.value: "${metricId}" is a ${what} value and there is no ${what} ${String(itemId)}`);
      }
      ctx ??= { doc, spatial: spatial ?? resolveRelationships(doc) };
      return evaluator.value(ctx, metric.id, itemId);
    },
  });
}
