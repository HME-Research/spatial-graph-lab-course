import type { DesignDocumentV2 } from '@app/document/v2';
import type { SpatialResolution } from '@app/spatial';
import { METRIC_CATALOGUE } from './catalogue';
import { METRIC_DEPENDENCIES, type ComputedMetric, type MetricContext, type MetricDependency, type MetricEvaluator, type MetricRegistry, type MetricValue } from './contracts';

export { areaMetric, degreeMetric } from './catalogue';

/** The built-in catalogue (workstream M), in display order: see `METRIC_CATALOGUE` in `catalogue.ts`. */
export const BUILT_IN_METRICS: MetricRegistry = METRIC_CATALOGUE;

type DocumentDependency = Exclude<MetricDependency, 'resolution'>;
const signatureCache = new WeakMap<DesignDocumentV2, Partial<Record<DocumentDependency, string>>>();

const SIGNATURE_TEXT: Readonly<Record<DocumentDependency, (doc: DesignDocumentV2) => unknown>> = {
  topology: (doc) => [doc.nodes.map((n) => n.id), doc.edges.map((e) => [e.id, e.source, e.target, e.kind])],
  geometry: (doc) => doc.nodes.map((n) => [n.id, n.grid, n.size]),
  types: (doc) => doc.nodes.map((n) => [n.id, n.typeId]),
  attributes: (doc) => [doc.nodes.map((n) => [n.id, n.attributes]), doc.edges.map((e) => [e.id, e.attributes])],
  settings: (doc) => doc.settings,
};

function signature(doc: DesignDocumentV2, dependency: DocumentDependency): string {
  let entry = signatureCache.get(doc);
  if (!entry) signatureCache.set(doc, (entry = {}));
  return (entry[dependency] ??= JSON.stringify(SIGNATURE_TEXT[dependency](doc)));
}

const idCache = new WeakMap<DesignDocumentV2, { nodes?: ReadonlySet<string>; edges?: ReadonlySet<string> }>();

function itemIds(doc: DesignDocumentV2, collection: 'nodes' | 'edges'): ReadonlySet<string> {
  let entry = idCache.get(doc);
  if (!entry) idCache.set(doc, (entry = {}));
  return (entry[collection] ??= new Set((collection === 'nodes' ? doc.nodes : doc.edges).map((item) => item.id)));
}

type DependencyKey = Partial<Record<MetricDependency, string | SpatialResolution>>;

function dependencyKey(ctx: MetricContext, dependsOn: readonly MetricDependency[]): DependencyKey {
  const key: DependencyKey = {};
  for (const d of dependsOn) key[d] = d === 'resolution' ? ctx.spatial : signature(ctx.doc, d);
  return key;
}

const sameKey = (a: DependencyKey, b: DependencyKey, dependsOn: readonly MetricDependency[]) => dependsOn.every((d) => a[d] === b[d]);

interface CacheEntry {
  doc: DesignDocumentV2;
  spatial: SpatialResolution;
  key: DependencyKey;
  readonly values: Map<string, MetricValue | null>;
}

/**
 * Entries kept per metric. More than one, so that alternating between a few documents (e.g.
 * switching scenarios, or comparing two) does not recompute on every switch.
 */
export const METRIC_CACHE_ENTRIES = 4;

function checkMetric(metric: ComputedMetric): void {
  if (metric.dependsOn.length === 0) {
    throw new Error(`metric "${metric.id}" declares no dependencies; list everything compute reads in dependsOn (${METRIC_DEPENDENCIES.join(', ')})`);
  }
  for (const d of metric.dependsOn) {
    if (!(METRIC_DEPENDENCIES as readonly string[]).includes(d)) throw new Error(`metric "${metric.id}" declares unknown dependency "${String(d)}"`);
  }
}

/**
 * Memoised evaluator. Per metric, values are cached in a small most-recently-used list of
 * (doc, spatial) entries (`METRIC_CACHE_ENTRIES`). A context whose identities differ from every
 * entry still reuses an entry when every dependency the metric declares is unchanged (e.g. moving
 * a room keeps `degree` but recomputes `area`). Pure apart from its private cache.
 * Registration throws for a duplicate id, an empty `dependsOn` or an unknown dependency.
 */
export function createMetricEvaluator(registry: MetricRegistry = BUILT_IN_METRICS): MetricEvaluator {
  const byId = new Map<string, ComputedMetric>();
  for (const metric of registry) {
    if (byId.has(metric.id)) throw new Error(`duplicate metric id "${metric.id}"`);
    checkMetric(metric);
    byId.set(metric.id, metric);
  }
  /** Per metric id, most recently used first. */
  const cache = new Map<string, CacheEntry[]>();

  const metricOf = (metricId: string): ComputedMetric => {
    const metric = byId.get(metricId);
    if (!metric) throw new Error(`unknown metric "${metricId}"`);
    return metric;
  };

  const entryFor = (ctx: MetricContext, metric: ComputedMetric): CacheEntry => {
    let entries = cache.get(metric.id);
    if (!entries) cache.set(metric.id, (entries = []));
    const promote = (index: number): CacheEntry => {
      const [entry] = entries.splice(index, 1);
      entries.unshift(entry!);
      return entry!;
    };
    const exact = entries.findIndex((e) => e.doc === ctx.doc && e.spatial === ctx.spatial);
    if (exact >= 0) return promote(exact);
    const key = dependencyKey(ctx, metric.dependsOn);
    const same = entries.findIndex((e) => sameKey(e.key, key, metric.dependsOn));
    if (same >= 0) {
      const entry = promote(same);
      entry.doc = ctx.doc;
      entry.spatial = ctx.spatial;
      entry.key = key;
      return entry;
    }
    const fresh: CacheEntry = { doc: ctx.doc, spatial: ctx.spatial, key, values: new Map() };
    entries.unshift(fresh);
    if (entries.length > METRIC_CACHE_ENTRIES) entries.length = METRIC_CACHE_ENTRIES;
    return fresh;
  };

  const itemExists = (ctx: MetricContext, metric: ComputedMetric, itemId: string) => itemIds(ctx.doc, metric.collection).has(itemId);

  const value = (ctx: MetricContext, metricId: string, itemId: string): MetricValue | null => {
    const metric = metricOf(metricId);
    if (!itemExists(ctx, metric, itemId)) return null;
    const entry = entryFor(ctx, metric);
    if (entry.values.has(itemId)) return entry.values.get(itemId)!;
    const computed = metric.compute(ctx, itemId);
    entry.values.set(itemId, computed);
    return computed;
  };

  return {
    metrics: registry,
    value,
    values(ctx, metricId) {
      const metric = metricOf(metricId);
      const items = metric.collection === 'nodes' ? ctx.doc.nodes : ctx.doc.edges;
      return new Map(items.map((item) => [item.id, value(ctx, metricId, item.id)] as const));
    },
  };
}
