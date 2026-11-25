import type { Selection } from '@core/viewer/selection';
import type { CatalogueMetric } from './catalogue';
import type { ComputedMetric, MetricContext, MetricEvaluator, MetricValue } from './contracts';
import { createMetricEvaluator } from './registry';
import { enabledMetrics, type EnabledMetricIds } from './selection';

/**
 * View-model for the read-only "Calculated" rows of Properties (workstream A / integration render
 * it; this module only decides content). Pure apart from the shared evaluator's cache.
 */

/** Shared memoised evaluator for the built-in catalogue (one per app, so views share the cache). */
export const defaultMetricEvaluator: MetricEvaluator = createMetricEvaluator();

export const NO_METRIC_VALUE = 'no value';

/** Up to two decimals, trailing zeros removed; `-0` shows as `0`. */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return NO_METRIC_VALUE;
  return String(Math.round(n * 100) / 100 + 0);
}

/** Display text of one value: "54 m²", "yes"/"no", the text itself, or "no value". */
export function formatMetricValue(metric: Pick<ComputedMetric, 'unit'>, value: MetricValue | null): string {
  if (value === null) return NO_METRIC_VALUE;
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'string') return value;
  const text = formatNumber(value);
  return text !== NO_METRIC_VALUE && metric.unit ? `${text} ${metric.unit}` : text;
}

export interface MetricRow {
  readonly id: string;
  readonly label: string;
  readonly unit?: string | undefined;
  readonly valueKind: ComputedMetric['valueKind'];
  readonly value: MetricValue | null;
  readonly text: string;
  /** Definition text for a tooltip / `i` dialog (empty for a metric without one). */
  readonly definition: string;
  /** Always true: calculated values are never edited. */
  readonly readOnly: true;
}

/**
 * Rows of the enabled metrics for the selected node or edge, in catalogue order. Empty for no
 * selection or an item that is not in `ctx.doc`. Values are computed on read from `ctx`, so they
 * are current for whatever document and resolution the caller passes.
 */
export function metricRows(
  selection: Selection,
  ctx: MetricContext,
  enabledIds: EnabledMetricIds,
  evaluator: MetricEvaluator = defaultMetricEvaluator,
): MetricRow[] {
  if (selection.kind !== 'node' && selection.kind !== 'edge') return [];
  const collection = selection.kind === 'node' ? 'nodes' : 'edges';
  const items: readonly { readonly id: number }[] = collection === 'nodes' ? ctx.doc.nodes : ctx.doc.edges;
  if (!items.some((item) => item.id === selection.id)) return [];
  return enabledMetrics(enabledIds, collection, evaluator.metrics).map((metric) => {
    const value = evaluator.value(ctx, metric.id, selection.id);
    return {
      id: metric.id,
      label: metric.label,
      unit: metric.unit,
      valueKind: metric.valueKind,
      value,
      text: formatMetricValue(metric, value),
      definition: (metric as Partial<CatalogueMetric>).definition ?? metric.description ?? '',
      readOnly: true,
    };
  });
}
