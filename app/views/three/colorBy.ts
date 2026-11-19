import type { AttributeValue, RelationshipEdge, RoomNode } from '@app/document';
import { typeColor } from '@core/viewer/appearance';
import { formatMetricValue, formatNumber, type ComputedMetric, type MetricContext, type MetricEvaluator, type MetricValue } from '@app/metrics';
import { accessGroups } from './sceneModel';

/** What colour-by reads of a room and a relationship. */
type ColorNode = Pick<RoomNode, 'id' | 'function' | 'custom'>;
type ColorEdge = Pick<RelationshipEdge, 'id' | 'source' | 'target'>;

/**
 * View-local colour-by logic for the 3D views (pure).
 *  - `type`: node function (functionId) using the shared `typeColor`, identical to Graph 2D.
 *  - `group`: access group = connected component over explicit edges.
 *  - `attribute`: a node attribute key; numeric keys get a sequential scale, others are categorical.
 *  - `metric`: a calculated node value (`@app/metrics`): numbers get the sequential scale, booleans
 *    yes/no colours, text is categorical. Values come from a `MetricColorSource` computed on read
 *    from the current document and resolution, so they follow every graph/geometry change.
 * Nodes without a usable value (attribute absent or null) get MISSING_COLOR and are listed in the legend.
 */
export type ColorMode =
  | { readonly kind: 'type' }
  | { readonly kind: 'group' }
  | { readonly kind: 'attribute'; readonly key: string }
  | { readonly kind: 'metric'; readonly metricId: string };

/**
 * Calculated node values available to colour-by: the node metrics on offer (e.g. the project's
 * enabled ones) and their current values. Build it with `metricColorSource`.
 */
export interface MetricColorSource {
  readonly metrics: readonly Pick<ComputedMetric, 'id' | 'label' | 'unit' | 'valueKind'>[];
  values(metricId: string): ReadonlyMap<number, MetricValue | null>;
}

/**
 * Colour source over the NODE metrics among `metricIds` (default: every node metric of the
 * evaluator) for one (document, resolution) context. Values are read lazily through the
 * evaluator's cache; nothing is stored on the document.
 */
export function metricColorSource(evaluator: MetricEvaluator, ctx: MetricContext, metricIds?: readonly string[]): MetricColorSource {
  const wanted = metricIds ? new Set(metricIds) : null;
  const metrics = evaluator.metrics.filter((m) => m.collection === 'nodes' && (wanted === null || wanted.has(m.id)));
  return { metrics, values: (metricId) => evaluator.values(ctx, metricId) };
}

export const DEFAULT_COLOR_MODE: ColorMode = Object.freeze({ kind: 'type' });

/** Neutral grey for "no value", clearly different from every palette colour. */
export const MISSING_COLOR = '#b9b9b2';

/** Categorical palette for attribute values and groups (Tableau 10, colour-blind aware ordering). */
export const CATEGORY_PALETTE = [
  '#4e79a7',
  '#f28e2b',
  '#59a14f',
  '#e15759',
  '#76b7b2',
  '#edc948',
  '#b07aa1',
  '#ff9da7',
  '#9c755f',
  '#3b3b98',
] as const;

/** Calculated yes/no values: the same pair as boolean analysis results. */
export const BOOLEAN_COLORS = Object.freeze({ true: '#2e7d4f', false: '#b9c4cf' } as const);

/** Sequential scale end points for numeric attributes (light → dark). */
export const NUMERIC_LOW = '#f6e3a1';
export const NUMERIC_HIGH = '#3a2c7a';

/** Legends list at most this many numeric values individually; beyond that only min/max are shown. */
const MAX_NUMERIC_LEGEND = 8;

export interface LegendEntry {
  readonly label: string;
  readonly color: string;
  readonly count: number;
  readonly missing?: true;
}

export interface Coloring {
  readonly title: string;
  readonly colorOf: ReadonlyMap<number, string>;
  /** Nodes with no value for the chosen attribute. */
  readonly missing: ReadonlySet<number>;
  readonly legend: readonly LegendEntry[];
  /** Present for numeric attributes: draw a gradient bar from min to max. */
  readonly scale?: { readonly min: number; readonly max: number };
  /** Extra explanation shown under the legend (e.g. repeated colours). */
  readonly note?: string;
}

/** Attribute keys used by any node, sorted. */
export function attributeKeys(nodes: readonly ColorNode[]): string[] {
  const keys = new Set<string>();
  for (const n of nodes) for (const k of Object.keys(n.custom)) keys.add(k);
  return [...keys].sort();
}

/**
 * Falls back to `type` when the chosen attribute no longer exists in the document, or the chosen
 * metric is not on offer (`metricIds`: ids of the available metrics, e.g. from `source.metrics`).
 */
export function effectiveColorMode(mode: ColorMode, keys: readonly string[], metricIds: readonly string[] = []): ColorMode {
  if (mode.kind === 'attribute' && !keys.includes(mode.key)) return DEFAULT_COLOR_MODE;
  if (mode.kind === 'metric' && !metricIds.includes(mode.metricId)) return DEFAULT_COLOR_MODE;
  return mode;
}

/** `<select>` value encoding. */
export function colorModeToValue(mode: ColorMode): string {
  if (mode.kind === 'attribute') return `attr:${mode.key}`;
  if (mode.kind === 'metric') return `metric:${mode.metricId}`;
  return mode.kind;
}

export function colorModeFromValue(value: string): ColorMode {
  if (value === 'group') return { kind: 'group' };
  if (value.startsWith('attr:')) return { kind: 'attribute', key: value.slice(5) };
  if (value.startsWith('metric:')) return { kind: 'metric', metricId: value.slice(7) };
  return DEFAULT_COLOR_MODE;
}

/**
 * Colours for every node. `metrics` is needed for a `metric` mode; without it, or for a metric
 * it does not offer, the colouring falls back to type (as `effectiveColorMode` would).
 */
export function resolveColoring(
  nodes: readonly ColorNode[],
  edges: readonly ColorEdge[],
  mode: ColorMode,
  metrics?: MetricColorSource,
): Coloring {
  switch (mode.kind) {
    case 'type':
      return byType(nodes);
    case 'group':
      return byGroup(nodes, edges);
    case 'attribute':
      return byAttribute(nodes, mode.key);
    case 'metric': {
      const metric = metrics?.metrics.find((m) => m.id === mode.metricId);
      return metrics && metric ? byMetric(nodes, metric, metrics.values(metric.id)) : byType(nodes);
    }
  }
}

function byType(nodes: readonly ColorNode[]): Coloring {
  const counts = countBy(nodes, (n) => n.function);
  const types = [...counts.keys()].sort();
  const colours = new Set(types.map(typeColor));
  return {
    title: 'Node type',
    colorOf: new Map(nodes.map((n) => [n.id, typeColor(n.function)] as const)),
    missing: new Set(),
    legend: types.map((t) => ({ label: t, color: typeColor(t), count: counts.get(t)! })),
    ...(colours.size < types.length && { note: 'Some types share a fallback colour.' }),
  };
}

function byGroup(nodes: readonly ColorNode[], edges: readonly ColorEdge[]): Coloring {
  const { groupOf, count } = accessGroups(nodes, edges);
  const color = (g: number) => CATEGORY_PALETTE[g % CATEGORY_PALETTE.length]!;
  const sizes = countBy(nodes, (n) => groupOf.get(n.id)!);
  return {
    title: 'Access group (connected by edges)',
    colorOf: new Map(nodes.map((n) => [n.id, color(groupOf.get(n.id)!)] as const)),
    missing: new Set(),
    legend: [...sizes.keys()]
      .sort((a, b) => a - b)
      .map((g) => ({ label: `Group ${g + 1}`, color: color(g), count: sizes.get(g)! })),
    ...(count > CATEGORY_PALETTE.length && { note: `${count} groups: colours repeat.` }),
  };
}

function byAttribute(nodes: readonly ColorNode[], key: string): Coloring {
  return byValues(nodes, (n) => (Object.hasOwn(n.custom, key) ? n.custom[key] : undefined), `Attribute “${key}”`, {
    label: String,
    booleans: false,
  });
}

/** Missing: no value, or a number that is not finite (a calculation without a usable result). */
function byMetric(
  nodes: readonly ColorNode[],
  metric: Pick<ComputedMetric, 'id' | 'label' | 'unit' | 'valueKind'>,
  values: ReadonlyMap<number, MetricValue | null>,
): Coloring {
  return byValues(
    nodes,
    (n) => {
      const v = values.get(n.id);
      return typeof v === 'number' && !Number.isFinite(v) ? null : v;
    },
    metric.unit ? `${metric.label} (${metric.unit})` : metric.label,
    { label: (v) => formatMetricValue(metric, v), booleans: true, round: true },
  );
}

interface ValueOptions {
  /** Legend text of a numeric value. */
  readonly label: (v: number) => string;
  /** Booleans-only values use the yes/no pair (`BOOLEAN_COLORS`) instead of the palette. */
  readonly booleans: boolean;
  /** Round the gradient's end labels to two decimals (calculated values). */
  readonly round?: boolean;
}

function byValues(
  nodes: readonly ColorNode[],
  valueOf: (n: ColorNode) => AttributeValue | undefined,
  title: string,
  options: ValueOptions,
): Coloring {
  const missing = new Set<number>();
  const present: { id: number; value: Exclude<AttributeValue, null> }[] = [];
  for (const n of nodes) {
    const v = valueOf(n);
    if (v === undefined || v === null) missing.add(n.id);
    else present.push({ id: n.id, value: v });
  }
  const missingEntry: LegendEntry[] = missing.size
    ? [{ label: 'no value (missing or null)', color: MISSING_COLOR, count: missing.size, missing: true }]
    : [];
  const colorOf = new Map<number, string>([...missing].map((id) => [id, MISSING_COLOR] as const));

  const numbers = present.every((p) => typeof p.value === 'number');
  if (numbers && present.length > 0) {
    const values = present.map((p) => p.value as number);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const at = (v: number) => numericColor(v, min, max);
    for (const p of present) colorOf.set(p.id, at(p.value as number));
    const counts = countBy(values, (v) => v);
    const distinct = [...counts.keys()].sort((a, b) => a - b);
    const shown = distinct.length <= MAX_NUMERIC_LEGEND ? distinct : [min, max];
    return {
      title,
      colorOf,
      missing,
      legend: [
        ...shown.map((v) => ({
          label: distinct.length <= MAX_NUMERIC_LEGEND ? options.label(v) : `${v === min ? 'min' : 'max'} ${options.label(v)}`,
          color: at(v),
          count: counts.get(v)!,
        })),
        ...missingEntry,
      ],
      ...(min !== max && { scale: options.round ? { min: Number(formatNumber(min)), max: Number(formatNumber(max)) } : { min, max } }),
    };
  }

  if (options.booleans && present.length > 0 && present.every((p) => typeof p.value === 'boolean')) {
    for (const p of present) colorOf.set(p.id, BOOLEAN_COLORS[String(p.value) as 'true' | 'false']);
    const counts = countBy(present, (p) => p.value as boolean);
    return {
      title,
      colorOf,
      missing,
      legend: [
        ...([true, false] as const)
          .filter((b) => counts.has(b))
          .map((b) => ({ label: b ? 'yes' : 'no', color: BOOLEAN_COLORS[String(b) as 'true' | 'false'], count: counts.get(b)! })),
        ...missingEntry,
      ],
    };
  }

  // Categorical: group by type + value so `1` and `"1"` stay distinct.
  const catKey = (v: Exclude<AttributeValue, null>) => `${typeof v}:${String(v)}`;
  const byKey = new Map<string, { label: string; value: Exclude<AttributeValue, null>; count: number }>();
  for (const p of present) {
    const k = catKey(p.value);
    const entry = byKey.get(k);
    if (entry) entry.count++;
    else byKey.set(k, { label: labelOf(p.value), value: p.value, count: 1 });
  }
  const ordered = [...byKey.entries()].sort(([, a], [, b]) => compareValues(a.value, b.value));
  const colorFor = new Map(ordered.map(([k], i) => [k, CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]!] as const));
  for (const p of present) colorOf.set(p.id, colorFor.get(catKey(p.value))!);
  return {
    title,
    colorOf,
    missing,
    legend: [...ordered.map(([k, e]) => ({ label: e.label, color: colorFor.get(k)!, count: e.count })), ...missingEntry],
    ...(ordered.length > CATEGORY_PALETTE.length && { note: `${ordered.length} values: colours repeat.` }),
  };
}

function labelOf(v: Exclude<AttributeValue, null>): string {
  return typeof v === 'string' ? (v === '' ? '(empty text)' : v) : String(v);
}

const TYPE_ORDER = { boolean: 0, number: 1, string: 2 } as const;

function compareValues(a: Exclude<AttributeValue, null>, b: Exclude<AttributeValue, null>): number {
  const ta = TYPE_ORDER[typeof a as keyof typeof TYPE_ORDER];
  const tb = TYPE_ORDER[typeof b as keyof typeof TYPE_ORDER];
  if (ta !== tb) return ta - tb;
  if (typeof a === 'string') return a < (b as string) ? -1 : a > (b as string) ? 1 : 0;
  return Number(a) - Number(b);
}

function countBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, number> {
  const m = new Map<K, number>();
  for (const item of items) m.set(key(item), (m.get(key(item)) ?? 0) + 1);
  return m;
}

/** Linear sRGB-space interpolation between NUMERIC_LOW and NUMERIC_HIGH; a single value gets the midpoint. */
export function numericColor(value: number, min: number, max: number): string {
  const t = max === min ? 0.5 : Math.min(1, Math.max(0, (value - min) / (max - min)));
  return mixHex(NUMERIC_LOW, NUMERIC_HIGH, t);
}

export function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  return `#${pa.map((c, i) => Math.round(c + (pb[i]! - c) * t).toString(16).padStart(2, '0')).join('')}`;
}

function parseHex(hex: string): number[] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
