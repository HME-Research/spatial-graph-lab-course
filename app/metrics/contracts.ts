import type { DesignDocumentV2 } from '@app/document/v2';
import type { SpatialResolution } from '@app/spatial';

/**
 * Computed-metric contract (Gate F, F-D; root-owned). Pure: no React, no Three.js.
 *
 * A metric is derived on demand from the document and its spatial resolution. Values are never
 * written to the document, never part of undo history and never exported (`serializeDesignV2`
 * does not see them). `Level` is system-backed (`grid[2]`), not a metric.
 */

/**
 * What a metric reads. The evaluator reuses a cached value while every declared dependency is
 * unchanged, so `dependsOn` must list everything `compute` reads:
 * - `topology`: node ids and edges (id, source, target, kind);
 * - `geometry`: each node's `grid` and `size`;
 * - `types`: each node's `typeId`;
 * - `attributes`: node and edge custom `attributes`;
 * - `settings`: the document `settings` (e.g. per-type appearance);
 * - `resolution`: the `SpatialResolution` object (by identity).
 * Reading any other document data (metadata, display ids, diagram positions) is not supported.
 * `dependsOn` must not be empty: `createMetricEvaluator` rejects such a metric (a metric that
 * truly reads nothing would be a constant; one that forgot to declare would be cached wrongly).
 */
export const METRIC_DEPENDENCIES = ['topology', 'geometry', 'types', 'attributes', 'settings', 'resolution'] as const;
export type MetricDependency = (typeof METRIC_DEPENDENCIES)[number];

export type MetricValueKind = 'number' | 'boolean' | 'text';
export type MetricValue = number | boolean | string;

export interface MetricContext {
  readonly doc: DesignDocumentV2;
  readonly spatial: SpatialResolution;
}

export interface ComputedMetric {
  readonly id: string;
  readonly label: string;
  readonly collection: 'nodes' | 'edges';
  readonly valueKind: MetricValueKind;
  readonly unit?: string | undefined;
  /**
   * Optional plain-language definition (exactly what is counted or measured), shown as a tooltip or
   * in the Attributes catalogue (I1, additive). The built-in catalogue carries it as `definition`.
   */
  readonly description?: string | undefined;
  /** Non-empty; see `METRIC_DEPENDENCIES`. */
  readonly dependsOn: readonly MetricDependency[];
  /** Pure. `null` when the item does not exist or the metric has no value for it. */
  compute(ctx: MetricContext, itemId: string): MetricValue | null;
}

export type MetricRegistry = readonly ComputedMetric[];

export interface MetricEvaluator {
  readonly metrics: MetricRegistry;
  /** One value; `null` for an unknown item. Throws for an unknown metric id (a programming error). */
  value(ctx: MetricContext, metricId: string, itemId: string): MetricValue | null;
  /** Every item of the metric's collection, in document order. */
  values(ctx: MetricContext, metricId: string): ReadonlyMap<string, MetricValue | null>;
}
