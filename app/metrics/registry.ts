import { DEFAULT_CELL_SIZE } from '@core/viewer/coordinates';
import type { DesignDocumentV2 } from '@app/document/v2';
import type { SpatialResolution } from '@app/spatial';
import type { ComputedMetric, MetricContext, MetricDependency, MetricEvaluator, MetricRegistry, MetricValue } from './contracts';

/** Node footprint (plan) area in m²: size x × size y cells at the central cell size (3 m). */
export const areaMetric: ComputedMetric = {
  id: 'area',
  label: 'Area',
  collection: 'nodes',
  valueKind: 'number',
  unit: 'm²',
  dependsOn: ['geometry'],
  compute: ({ doc }, nodeId) => {
    const node = doc.nodes.find((n) => n.id === nodeId);
    if (!node) return null;
    const side = DEFAULT_CELL_SIZE.horizontal;
    return node.size[0] * node.size[1] * side * side;
  },
};

/** Number of relationships incident to the node (a self-loop would count twice). */
export const degreeMetric: ComputedMetric = {
  id: 'degree',
  label: 'Degree',
  collection: 'nodes',
  valueKind: 'number',
  dependsOn: ['topology'],
  compute: ({ doc }, nodeId) => {
    if (!doc.nodes.some((n) => n.id === nodeId)) return null;
    let degree = 0;
    for (const e of doc.edges) degree += (e.source === nodeId ? 1 : 0) + (e.target === nodeId ? 1 : 0);
    return degree;
  },
};

/** Representative metrics at Gate F; the rest of the catalogue belongs to workstream M. */
export const BUILT_IN_METRICS: MetricRegistry = Object.freeze([areaMetric, degreeMetric]);

type Signatures = { topology?: string; geometry?: string };
const signatureCache = new WeakMap<DesignDocumentV2, Signatures>();

function signature(doc: DesignDocumentV2, dependency: 'topology' | 'geometry'): string {
  let entry = signatureCache.get(doc);
  if (!entry) signatureCache.set(doc, (entry = {}));
  const cached = entry[dependency];
  if (cached !== undefined) return cached;
  const text =
    dependency === 'topology'
      ? JSON.stringify([doc.nodes.map((n) => n.id), doc.edges.map((e) => [e.id, e.source, e.target, e.kind])])
      : JSON.stringify(doc.nodes.map((n) => [n.id, n.grid, n.size]));
  entry[dependency] = text;
  return text;
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
 * Memoised evaluator. Per metric, values are cached for the last (doc, spatial) identity pair; when
 * either identity changes, the cache survives if every dependency the metric declares is unchanged
 * (e.g. moving a room keeps `degree` but recomputes `area`). Pure apart from its private cache.
 */
export function createMetricEvaluator(registry: MetricRegistry = BUILT_IN_METRICS): MetricEvaluator {
  const byId = new Map<string, ComputedMetric>();
  for (const metric of registry) {
    if (byId.has(metric.id)) throw new Error(`duplicate metric id "${metric.id}"`);
    byId.set(metric.id, metric);
  }
  const cache = new Map<string, CacheEntry>();

  const metricOf = (metricId: string): ComputedMetric => {
    const metric = byId.get(metricId);
    if (!metric) throw new Error(`unknown metric "${metricId}"`);
    return metric;
  };

  const entryFor = (ctx: MetricContext, metric: ComputedMetric): CacheEntry => {
    const entry = cache.get(metric.id);
    if (entry && entry.doc === ctx.doc && entry.spatial === ctx.spatial) return entry;
    const key = dependencyKey(ctx, metric.dependsOn);
    if (entry && sameKey(entry.key, key, metric.dependsOn)) {
      entry.doc = ctx.doc;
      entry.spatial = ctx.spatial;
      entry.key = key;
      return entry;
    }
    const fresh: CacheEntry = { doc: ctx.doc, spatial: ctx.spatial, key, values: new Map() };
    cache.set(metric.id, fresh);
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
