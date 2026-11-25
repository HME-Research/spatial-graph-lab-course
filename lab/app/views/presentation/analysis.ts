import type { AttributeValue } from '@app/document';
import { isNodeSelected, type Selection } from '@core/viewer/selection';
import { CATEGORY_PALETTE, MISSING_COLOR, numericColor } from '../three/colorBy';
import { ANALYSIS_HIGHLIGHT, SELECTION, WARNING_TONE } from './vocabulary';

/**
 * Read-only view model for showing an analysis result on nodes (pure; Stage 07).
 *
 * P4: an analysis may also (or only) HIGHLIGHT nodes and edges (Analyse tab: degree, paths,
 * bridges…). Without `nodeValues` it is highlight-only: highlighted nodes get `ANALYSIS_HIGHLIGHT`
 * and every other node keeps its normal colour.
 *
 * Analysis colours are a temporary overlay, separate from the document (nothing is written to node
 * attributes) and from the selection (the pink selection ring always wins). The host keeps at most
 * one `AnalysisPresentation`, shows it on request, clears it with `null`, and rebuilds it with
 * `stale: true` after any document change so the overlay is visibly marked as out of date.
 */

export interface AnalysisInput {
  /** Algorithm label, e.g. "Access depth". */
  readonly title: string;
  readonly summary?: string;
  /** Values reported by the algorithm, keyed by node id. Absent: a highlight-only result. */
  readonly nodeValues?: Readonly<Record<number, AttributeValue>>;
  /** Nodes / edges the result points at (P4), highlighted in every view. */
  readonly highlightNodes?: readonly number[];
  readonly highlightEdges?: readonly number[];
  /** Node ids of the document the algorithm ran on, in document order. */
  readonly ranOnNodeIds: readonly number[];
  /** Node ids of the current document (deleted nodes are flagged, new nodes get "no value"). */
  readonly currentNodeIds: readonly number[];
  /** True when the document changed since the run (`isStale` in app/session/algorithmSession). */
  readonly stale: boolean;
  /** Optional display labels (displayId) for rows. */
  readonly labelOf?: ReadonlyMap<number, string>;
}

export type AnalysisValueKind = 'numeric' | 'boolean' | 'categorical' | 'empty';

export interface AnalysisLegendEntry {
  readonly label: string;
  readonly color: string;
  readonly count: number;
  readonly missing?: true;
}

export interface AnalysisRowView {
  readonly nodeId: number;
  readonly label: string;
  readonly valueLabel: string;
  readonly color: string;
  readonly missing: boolean;
  /** False when the node no longer exists in the current document. */
  readonly exists: boolean;
}

export interface AnalysisPresentation {
  readonly title: string;
  readonly summary: string | null;
  readonly stale: boolean;
  /** Warning text when stale, otherwise null. */
  readonly staleMessage: string | null;
  readonly valueKind: AnalysisValueKind;
  /** Colour per CURRENT node id (nodes without a value get MISSING_COLOR). */
  readonly colorOf: ReadonlyMap<number, string>;
  /** Short value text per CURRENT node id ("3", "yes", "no value"). */
  readonly valueLabelOf: ReadonlyMap<number, string>;
  readonly legend: readonly AnalysisLegendEntry[];
  readonly scale: { readonly min: number; readonly max: number } | null;
  /** Rows for a table, in the order of the analysed document. */
  readonly rows: readonly AnalysisRowView[];
  /** Ids in `nodeValues` that were not in the analysed document (ignored). */
  readonly unknownIds: readonly number[];
  /** Analysed node ids that no longer exist. */
  readonly deletedIds: readonly number[];
  /** Overlay opacity hint: lower when stale so it reads as "old". */
  readonly overlayOpacity: number;
  /** False for a highlight-only result (no `nodeValues`): nodes keep their colour unless highlighted. */
  readonly hasValues: boolean;
  /** Highlighted node and edge ids (P4). */
  readonly highlightNodes: ReadonlySet<number>;
  readonly highlightEdges: ReadonlySet<number>;
}

export const NO_VALUE_LABEL = 'no value';
export const STALE_MESSAGE = 'Out of date: the design changed after this analysis ran. Run it again for current values.';
const BOOLEAN_COLORS = { true: '#2e7d4f', false: '#b9c4cf' } as const;
const MAX_NUMERIC_LEGEND = 8;

const isNumber = (v: AttributeValue): v is number => typeof v === 'number' && Number.isFinite(v);

function valueLabel(v: AttributeValue | undefined): string {
  if (v === undefined || v === null) return NO_VALUE_LABEL;
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'number') return Number.isFinite(v) ? formatNumber(v) : NO_VALUE_LABEL;
  return v === '' ? '(empty text)' : v;
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}

/** Builds the presentation. Never mutates its input; same input → equal output. */
export function presentAnalysis(input: AnalysisInput): AnalysisPresentation {
  const highlightNodes = new Set(input.highlightNodes ?? []);
  const highlightEdges = new Set(input.highlightEdges ?? []);
  if (input.nodeValues === undefined) {
    return {
      title: input.title,
      summary: input.summary ?? null,
      stale: input.stale,
      staleMessage: input.stale ? STALE_MESSAGE : null,
      valueKind: 'empty',
      colorOf: new Map(),
      valueLabelOf: new Map(),
      legend: [],
      scale: null,
      rows: [],
      unknownIds: [],
      deletedIds: [],
      overlayOpacity: input.stale ? 0.45 : 0.9,
      hasValues: false,
      highlightNodes,
      highlightEdges,
    };
  }
  const nodeValues = input.nodeValues;
  const ranOn = new Set(input.ranOnNodeIds);
  const current = new Set(input.currentNodeIds);
  const valueOf = (id: number): AttributeValue | undefined =>
    ranOn.has(id) && Object.hasOwn(nodeValues, id) ? nodeValues[id] : undefined;

  const unknownIds = Object.keys(nodeValues)
    .map(Number)
    .filter((id) => !ranOn.has(id))
    .sort((a, b) => a - b);
  const deletedIds = input.ranOnNodeIds.filter((id) => !current.has(id) && Object.hasOwn(nodeValues, id));

  // Colour scheme from the analysed values (finite numbers, booleans, or anything else).
  const present = input.ranOnNodeIds.map(valueOf).filter((v): v is Exclude<AttributeValue, null> => v !== undefined && v !== null && !(typeof v === 'number' && !Number.isFinite(v)));
  const valueKind: AnalysisValueKind =
    present.length === 0 ? 'empty' : present.every(isNumber) ? 'numeric' : present.every((v) => typeof v === 'boolean') ? 'boolean' : 'categorical';

  let colorFor: (v: AttributeValue | undefined) => string;
  let legend: AnalysisLegendEntry[] = [];
  let scale: AnalysisPresentation['scale'] = null;
  const counts = new Map<string, { label: string; color: string; count: number; order: number }>();

  if (valueKind === 'numeric') {
    const nums = present as number[];
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    if (min !== max) scale = { min, max };
    colorFor = (v) => (v !== undefined && isNumber(v) ? numericColor(v, min, max) : MISSING_COLOR);
    const distinct = [...new Set(nums)].sort((a, b) => a - b);
    const shown = distinct.length <= MAX_NUMERIC_LEGEND ? distinct : [min, max];
    legend = shown.map((v) => ({
      label: distinct.length <= MAX_NUMERIC_LEGEND ? formatNumber(v) : `${v === min ? 'min' : 'max'} ${formatNumber(v)}`,
      color: numericColor(v, min, max),
      count: nums.filter((n) => n === v).length,
    }));
  } else if (valueKind === 'boolean') {
    colorFor = (v) => (typeof v === 'boolean' ? BOOLEAN_COLORS[String(v) as 'true' | 'false'] : MISSING_COLOR);
    for (const b of [true, false]) {
      const count = present.filter((v) => v === b).length;
      if (count > 0) legend.push({ label: b ? 'yes' : 'no', color: BOOLEAN_COLORS[String(b) as 'true' | 'false'], count });
    }
  } else {
    // Categorical: key by type + value so 1 and "1" stay distinct; ordered booleans, numbers, strings.
    const key = (v: Exclude<AttributeValue, null>) => `${typeof v}:${String(v)}`;
    const typeRank = { boolean: 0, number: 1, string: 2 } as Record<string, number>;
    const ordered = [...new Map(present.map((v) => [key(v), v] as const)).values()].sort((a, b) => {
      const d = typeRank[typeof a]! - typeRank[typeof b]!;
      if (d !== 0) return d;
      return typeof a === 'number' ? a - (b as number) : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
    });
    ordered.forEach((v, i) =>
      counts.set(key(v), { label: valueLabel(v), color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]!, count: 0, order: i }),
    );
    for (const v of present) counts.get(key(v))!.count++;
    colorFor = (v) => (v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v)) ? MISSING_COLOR : counts.get(key(v))?.color ?? MISSING_COLOR);
    legend = [...counts.values()].sort((a, b) => a.order - b.order).map(({ label, color, count }) => ({ label, color, count }));
  }

  const missingCount = input.ranOnNodeIds.filter((id) => {
    const v = valueOf(id);
    return v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v));
  }).length;
  if (missingCount > 0) legend.push({ label: `${NO_VALUE_LABEL} (unreachable, null or not reported)`, color: MISSING_COLOR, count: missingCount, missing: true });

  const colorOf = new Map<number, string>();
  const valueLabelOf = new Map<number, string>();
  for (const id of input.currentNodeIds) {
    const v = valueOf(id);
    colorOf.set(id, colorFor(v));
    valueLabelOf.set(id, valueLabel(v));
  }

  const rows: AnalysisRowView[] = input.ranOnNodeIds.map((id) => {
    const v = valueOf(id);
    return {
      nodeId: id,
      label: input.labelOf?.get(id) ?? String(id),
      valueLabel: valueLabel(v),
      color: colorFor(v),
      missing: valueLabel(v) === NO_VALUE_LABEL,
      exists: current.has(id),
    };
  });

  return {
    title: input.title,
    summary: input.summary ?? null,
    stale: input.stale,
    staleMessage: input.stale ? STALE_MESSAGE : null,
    valueKind,
    colorOf,
    valueLabelOf,
    legend,
    scale,
    rows,
    unknownIds,
    deletedIds,
    overlayOpacity: input.stale ? 0.45 : 0.9,
    hasValues: true,
    highlightNodes,
    highlightEdges,
  };
}

/** Whether a node / edge is highlighted by the shown analysis (P4). */
export const isAnalysisNode = (presentation: AnalysisPresentation | null, nodeId: number): boolean => presentation?.highlightNodes.has(nodeId) ?? false;
export const isAnalysisEdge = (presentation: AnalysisPresentation | null, edgeId: number): boolean => presentation?.highlightEdges.has(edgeId) ?? false;

/** How a renderer should draw one node while an analysis is shown. */
export interface AnalysisNodeStyle {
  /** Analysis fill (null: no analysis shown, keep the normal type colour). */
  readonly fill: string | null;
  readonly fillOpacity: number;
  /** Outline: the selection ring when selected; analysis never draws a ring. */
  readonly ring: string | null;
  /** Short value text (null when no analysis is shown). */
  readonly valueLabel: string | null;
  /** Stale overlays get a warning-coloured hatch/badge hint. */
  readonly staleBadge: string | null;
}

/**
 * Style for a node. Selection keeps priority: a selected node always gets the selection ring, and
 * the analysis colour only ever changes the fill. Unknown node ids get a neutral "no value" style.
 */
export function analysisNodeStyle(
  nodeId: number,
  presentation: AnalysisPresentation | null,
  selection: Selection,
): AnalysisNodeStyle {
  const ring = isNodeSelected(selection, nodeId) ? SELECTION : null;
  if (!presentation) return { fill: null, fillOpacity: 1, ring, valueLabel: null, staleBadge: null };
  if (!presentation.hasValues) {
    const lit = presentation.highlightNodes.has(nodeId);
    return { fill: lit ? ANALYSIS_HIGHLIGHT : null, fillOpacity: lit ? presentation.overlayOpacity : 1, ring, valueLabel: null, staleBadge: lit && presentation.stale ? WARNING_TONE.border : null };
  }
  return {
    fill: presentation.colorOf.get(nodeId) ?? MISSING_COLOR,
    fillOpacity: presentation.overlayOpacity,
    ring,
    valueLabel: presentation.valueLabelOf.get(nodeId) ?? NO_VALUE_LABEL,
    staleBadge: presentation.stale ? WARNING_TONE.border : null,
  };
}
