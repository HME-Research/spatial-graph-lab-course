import type { ComputedMetric, MetricRegistry } from './contracts';
import { BUILT_IN_METRICS } from './registry';

/**
 * Which calculated fields a project shows (Properties rows, colour-by options): a project-level
 * list of metric ids. Pure contract helpers only; the list is persisted in the project file by
 * the integration owner (proposed field: `ProjectFileV2.settings.calculatedFields: string[]`).
 *
 * The list stores ids only, never values. Canonical form: known ids, no duplicates, in catalogue
 * order (so the stored list, and every UI built from it, is deterministic).
 */
export type EnabledMetricIds = readonly string[];

/** Shown when a project has no stored choice. */
export const DEFAULT_ENABLED_METRICS: EnabledMetricIds = Object.freeze(['area', 'volume', 'degree', 'exposed-facade-length', 'unresolved-connections', 'resolution-status']);

export interface SanitizedMetricIds {
  readonly enabled: EnabledMetricIds;
  /** Entries that were dropped: unknown ids or non-strings (as text), in input order. */
  readonly dropped: readonly string[];
}

/**
 * Validate a stored list (runtime data, e.g. from an imported project file). `undefined` → the
 * defaults. Anything that is not an array → the defaults, with the input reported as dropped.
 * Unknown ids are dropped (a catalogue may shrink); the result is canonical.
 */
export function sanitizeEnabledMetrics(raw: unknown, registry: MetricRegistry = BUILT_IN_METRICS): SanitizedMetricIds {
  if (raw === undefined) return { enabled: canonical(DEFAULT_ENABLED_METRICS, registry), dropped: [] };
  if (!Array.isArray(raw)) return { enabled: canonical(DEFAULT_ENABLED_METRICS, registry), dropped: [describe(raw)] };
  const known = new Set(registry.map((m) => m.id));
  const dropped: string[] = [];
  const ids: string[] = [];
  for (const item of raw as unknown[]) {
    if (typeof item === 'string' && known.has(item)) ids.push(item);
    else dropped.push(describe(item));
  }
  return { enabled: canonical(ids, registry), dropped };
}

const describe = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v) ?? String(v));

/** Known ids only, deduplicated, in registry order. */
export function canonical(ids: Iterable<string>, registry: MetricRegistry = BUILT_IN_METRICS): EnabledMetricIds {
  const wanted = new Set(ids);
  return registry.filter((m) => wanted.has(m.id)).map((m) => m.id);
}

/** Enable or disable one metric; returns a new canonical list. Unknown ids are ignored. */
export function setMetricEnabled(enabled: EnabledMetricIds, metricId: string, on: boolean, registry: MetricRegistry = BUILT_IN_METRICS): EnabledMetricIds {
  const next = new Set(enabled);
  if (on) next.add(metricId);
  else next.delete(metricId);
  return canonical(next, registry);
}

export const isMetricEnabled = (enabled: EnabledMetricIds, metricId: string): boolean => enabled.includes(metricId);

/** Enabled metrics of one collection, in registry order. */
export function enabledMetrics(enabled: EnabledMetricIds, collection: 'nodes' | 'edges', registry: MetricRegistry = BUILT_IN_METRICS): readonly ComputedMetric[] {
  const on = new Set(enabled);
  return registry.filter((m) => m.collection === collection && on.has(m.id));
}
