import type { AttributeValue, GraphEdge, GraphNode } from '../../spatial';
import { typeColor } from '../appearance';
import { accessGroups } from './sceneModel';

/**
 * View-local colour-by logic for the 3D views (pure).
 *  - `type`: node function (typeId) using the shared `typeColor`, identical to Graph 2D.
 *  - `group`: access group = connected component over explicit edges.
 *  - `attribute`: a node attribute key; numeric keys get a sequential scale, others are categorical.
 * Nodes without a usable value (attribute absent or null) get MISSING_COLOR and are listed in the legend.
 */
export type ColorMode =
  | { readonly kind: 'type' }
  | { readonly kind: 'group' }
  | { readonly kind: 'attribute'; readonly key: string };

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
  readonly colorOf: ReadonlyMap<string, string>;
  /** Nodes with no value for the chosen attribute. */
  readonly missing: ReadonlySet<string>;
  readonly legend: readonly LegendEntry[];
  /** Present for numeric attributes: draw a gradient bar from min to max. */
  readonly scale?: { readonly min: number; readonly max: number };
  /** Extra explanation shown under the legend (e.g. repeated colours). */
  readonly note?: string;
}

/** Attribute keys used by any node, sorted. */
export function attributeKeys(nodes: readonly GraphNode[]): string[] {
  const keys = new Set<string>();
  for (const n of nodes) for (const k of Object.keys(n.attributes)) keys.add(k);
  return [...keys].sort();
}

/** Falls back to `type` when the chosen attribute no longer exists in the document. */
export function effectiveColorMode(mode: ColorMode, keys: readonly string[]): ColorMode {
  return mode.kind === 'attribute' && !keys.includes(mode.key) ? DEFAULT_COLOR_MODE : mode;
}

/** `<select>` value encoding. */
export function colorModeToValue(mode: ColorMode): string {
  return mode.kind === 'attribute' ? `attr:${mode.key}` : mode.kind;
}

export function colorModeFromValue(value: string): ColorMode {
  if (value === 'group') return { kind: 'group' };
  if (value.startsWith('attr:')) return { kind: 'attribute', key: value.slice(5) };
  return DEFAULT_COLOR_MODE;
}

export function resolveColoring(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  mode: ColorMode,
): Coloring {
  switch (mode.kind) {
    case 'type':
      return byType(nodes);
    case 'group':
      return byGroup(nodes, edges);
    case 'attribute':
      return byAttribute(nodes, mode.key);
  }
}

function byType(nodes: readonly GraphNode[]): Coloring {
  const counts = countBy(nodes, (n) => n.typeId);
  const types = [...counts.keys()].sort();
  const colours = new Set(types.map(typeColor));
  return {
    title: 'Node type',
    colorOf: new Map(nodes.map((n) => [n.id, typeColor(n.typeId)] as const)),
    missing: new Set(),
    legend: types.map((t) => ({ label: t, color: typeColor(t), count: counts.get(t)! })),
    ...(colours.size < types.length && { note: 'Some types share a fallback colour.' }),
  };
}

function byGroup(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): Coloring {
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

function byAttribute(nodes: readonly GraphNode[], key: string): Coloring {
  const missing = new Set<string>();
  const present: { id: string; value: Exclude<AttributeValue, null> }[] = [];
  for (const n of nodes) {
    const v = Object.hasOwn(n.attributes, key) ? n.attributes[key] : undefined;
    if (v === undefined || v === null) missing.add(n.id);
    else present.push({ id: n.id, value: v });
  }
  const missingEntry: LegendEntry[] = missing.size
    ? [{ label: 'no value (missing or null)', color: MISSING_COLOR, count: missing.size, missing: true }]
    : [];
  const colorOf = new Map<string, string>([...missing].map((id) => [id, MISSING_COLOR] as const));
  const title = `Attribute “${key}”`;

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
          label: distinct.length <= MAX_NUMERIC_LEGEND ? String(v) : `${v === min ? 'min' : 'max'} ${v}`,
          color: at(v),
          count: counts.get(v)!,
        })),
        ...missingEntry,
      ],
      ...(min !== max && { scale: { min, max } }),
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
