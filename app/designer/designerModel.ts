import type { FacadeProvider } from '@app/building';
import { distortedModules, type FacadeModuleInstance } from '@app/assets';
import {
  canonicalFacadeModule,
  sameFacadeModule,
  connectorStyleOf,
  corridorRoofOf,
  corridorStyleOf,
  CONNECTOR_STYLES,
  DEFAULT_GROUP,
  effectiveLook,
  lookOfGroup,
  hasBands,
  niceStep,
  nodeLooks,
  roundToStep,
  sameGroup,
  styleModeOf,
  styleSetupOf,
  styleValueKey,
  styleValueOfNode,
  suggestDividers,
  nodeLabel,
  ROOF_STYLES,
  windowFractionSchema,
  WINDOW_LAYOUTS,
  WALL_STYLES,
  type ConnectorStyle,
  type DesignDocumentV2,
  type EffectiveLook,
  type Look,
  type StyleBy,
  type StyleGroupRef,
  type StyleMode,
  type StyleValue,
  type StyleValues,
  type FacadeModule,
  type FacadePlacement,
  type RoofStyle,
  type WindowLayout,
  type WallStyle,
} from '@app/document';
import { EMPTY_ATTRIBUTE_SCHEMA, findNodeType, type ActiveToolkit, type ProjectAttributeSchema } from '@app/extensions';
import { METRIC_CATALOGUE, type EnabledMetricIds } from '@app/metrics';
import type { DesignCommand, LookPatch, SpatialResolution } from '@app/spatial';
import { nodeTypeStatus, typeDisplayName, type NodeTypeStatus } from '@app/views/project';
import type { Selection } from '@core/viewer/selection';

/**
 * Designer model (06-designer): pure helpers behind the Designer panel. No React here.
 *
 * - One card per function PER DESIGN, stored as the `function` setup of "Style rooms by"
 *   (`settings.styles.function`, 2026-11-18) and changed through `set-look` / `remove-style-group`.
 * - Looks are resolved on read with `effectiveLook` (card → Default → project → built-in); nothing is
 *   materialised into the document, and project TypeScript definitions are never rewritten.
 * - No per-room overrides. Connector style is per relationship (Properties), not per type.
 */

/** Where a type's project default window coverage comes from. */
export type ProjectDefaultSource =
  /** The type definition declares `facade.windowFraction`. */
  | 'type-definition'
  /** No declaration (or no project / undefined type): the existing fallback façade. */
  | 'fallback'
  /** The definition is invalid: a closed wall is shown so the problem stays visible. */
  | 'broken';

export interface DesignerTypeRow {
  readonly typeId: string;
  /** Menu/label text, e.g. "Gallery (gallery)". */
  readonly name: string;
  readonly status: NodeTypeStatus;
  /** Rooms of this type in the current design. */
  readonly nodeCount: number;
  /** The design stores a card for a type that is neither in the project nor in the design. */
  readonly orphanOverride: boolean;
  readonly projectDefault: { readonly windowFraction: number; readonly source: ProjectDefaultSource };
  readonly effective: EffectiveLook;
  /** True when the design stores a card for this type. */
  readonly hasOverride: boolean;
  /** Readable warning (undefined / broken type, orphan card), or null. */
  readonly warning: string | null;
}

/**
 * Which card an edit applies to: a card of the `by` setup ("Style rooms by"). `name` is used in
 * undo labels. A plain string means the function card of that type id.
 */
export interface CardTarget {
  readonly by: StyleBy;
  readonly group: StyleGroupRef;
  readonly name: string;
}

const FUNCTION = 'function';
const functionCard = (typeId: string): StyleGroupRef => ({ kind: 'value', value: typeId });
const functionSetup = (doc: Pick<DesignDocumentV2, 'settings'>) => styleSetupOf(doc.settings, FUNCTION);
export const functionTarget = (typeId: string): CardTarget => ({ by: FUNCTION, group: functionCard(typeId), name: typeId });
const targetOf = (card: string | CardTarget): CardTarget => (typeof card === 'string' ? functionTarget(card) : card);

/** The stored look of a card (Default: its look, or undefined when Default sets nothing). */
function storedLook(doc: Pick<DesignDocumentV2, 'settings'>, t: CardTarget): Look | undefined {
  const setup = styleSetupOf(doc.settings, t.by);
  return t.group.kind === 'default' ? setup.default : lookOfGroup(setup, t.group);
}
/** Effective look of a card's rooms (card → Default → `windowFraction` → built-in). */
const effectiveFor = (doc: Pick<DesignDocumentV2, 'settings'>, t: CardTarget, windowFraction = 0): EffectiveLook =>
  effectiveLook(styleSetupOf(doc.settings, t.by), t.group, { windowFraction });
/** What a card's rooms get when the card sets nothing (Default for a value card or band; built-in for Default). */
const inheritedFor = (doc: Pick<DesignDocumentV2, 'settings'>, t: CardTarget, windowFraction = 0): EffectiveLook =>
  effectiveLook(t.group.kind === 'default' ? {} : styleSetupOf(doc.settings, t.by), DEFAULT_GROUP, { windowFraction });
const lookCommand = (t: CardTarget, patch: LookPatch): DesignCommand => ({ type: 'set-look', by: t.by, group: t.group, patch });

function projectDefaultSource(project: ActiveToolkit | null, status: NodeTypeStatus, typeId: string): ProjectDefaultSource {
  if (status.kind === 'broken') return 'broken';
  if (status.kind === 'registered' && project) {
    return findNodeType(project, typeId)?.definition.facade ? 'type-definition' : 'fallback';
  }
  return 'fallback';
}

function warningFor(row: Pick<DesignerTypeRow, 'status' | 'orphanOverride' | 'typeId'>): string | null {
  if (row.status.kind === 'broken') {
    const why = row.status.problems.length > 0 ? `: ${row.status.problems.join('; ')}` : '';
    return `The type definition in ${row.status.file} is invalid${why}. Rooms of this type show a closed wall until it is fixed.`;
  }
  if (row.orphanOverride) return 'No room uses this type and the project does not define it. Remove the card if it is not needed.';
  if (row.status.kind === 'undefined-type') {
    return `The active project does not define "${row.typeId}"; the fallback window coverage is used.`;
  }
  return null;
}

/**
 * One row per node type: the active project's registered (and broken) types in project order,
 * then types used only by the design, then types that only have a stored card. Feeds the
 * "+ Style another function" menu and the function cards' names and warnings.
 */
export function designerTypeRows(
  doc: DesignDocumentV2,
  project: ActiveToolkit | null,
  facade: FacadeProvider,
): DesignerTypeRow[] {
  const counts = new Map<string, number>();
  for (const node of doc.nodes) counts.set(node.typeId, (counts.get(node.typeId) ?? 0) + 1);

  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  };
  for (const type of project?.nodeTypes ?? []) add(type.id);
  [...counts.keys()].sort().forEach(add);
  (functionSetup(doc).groups ?? []).map((g) => String(g.value)).sort().forEach(add);

  return ordered.map((typeId) => {
    const status = nodeTypeStatus(project, typeId);
    const projectWindowFraction = facade(typeId).windowFraction;
    const nodeCount = counts.get(typeId) ?? 0;
    const inProject = project?.nodeTypes.some((t) => t.id === typeId) ?? false;
    const base = {
      typeId,
      name: typeDisplayName(status, typeId),
      status,
      nodeCount,
      orphanOverride: nodeCount === 0 && !inProject,
      projectDefault: { windowFraction: projectWindowFraction, source: projectDefaultSource(project, status, typeId) },
      effective: effectiveFor(doc, functionTarget(typeId), projectWindowFraction),
      hasOverride: storedLook(doc, functionTarget(typeId)) !== undefined,
    };
    return { ...base, warning: warningFor(base) };
  });
}

// ---------------------------------------------------------------------------------------------
// Cards ("Style rooms by", S2 2026-11-18): Default + the cards of the active attribute.

/** Readable names of the room attributes rooms can be styled by. */
export const STYLE_BY_LABELS: Readonly<Record<string, string>> = { function: 'Function', level: 'Level' };

/**
 * How the cards of an attribute work (S3, 2026-11-19):
 * - `function`: a card per function (type), added from the toolkit's and the design's types;
 * - `choice`: a card per option of a Choice attribute;
 * - `text`: a card per typed value (trimmed, case-insensitive);
 * - `yesno`: Yes and No cards;
 * - `number`: a card per value, or number bands (Level: whole storeys).
 */
export type StyleKind = 'function' | 'choice' | 'text' | 'yesno' | 'number';

/** One entry of the "Style rooms by" selector. */
export interface StyleAttribute {
  readonly by: StyleBy;
  /** Plain name: "Function", "Comfort", "Area". */
  readonly label: string;
  /** Selector group: the room itself, the project's own attributes, or a measured value. */
  readonly group: 'room' | 'attributes' | 'measured';
  readonly kind: StyleKind;
  /** Unit of a measured number ("m²"). */
  readonly unit?: string;
  /** Level: whole storeys, named "Level 2". */
  readonly level?: boolean;
  /** Choice: the options, in field order. */
  readonly options?: readonly string[];
  /**
   * `removed`: the attribute no longer exists (every room uses Default); `hidden`: a measured
   * value not shown in Attributes (styling still uses it).
   */
  readonly status: 'ok' | 'removed' | 'hidden';
}

const ROOM_ATTRIBUTES: readonly StyleAttribute[] = [
  { by: 'function', label: 'Function', group: 'room', kind: 'function', status: 'ok' },
  { by: 'level', label: 'Level', group: 'room', kind: 'number', level: true, status: 'ok' },
];

const FIELD_KIND_TO_STYLE: Readonly<Record<string, StyleKind>> = { enum: 'choice', text: 'text', boolean: 'yesno', number: 'number' };
const METRIC_KIND_TO_STYLE: Readonly<Record<string, StyleKind>> = { number: 'number', boolean: 'yesno', text: 'text' };

/** What `by` is, given the project's attributes and the measured values shown in Attributes. */
export function styleAttributeOf(by: StyleBy, schema: ProjectAttributeSchema = EMPTY_ATTRIBUTE_SCHEMA, shownMetrics?: EnabledMetricIds): StyleAttribute {
  const room = ROOM_ATTRIBUTES.find((a) => a.by === by);
  if (room) return room;
  if (by.startsWith('attribute:')) {
    const field = schema.nodes.find((f) => f.id === by.slice('attribute:'.length));
    if (!field) return { by, label: 'Removed attribute', group: 'attributes', kind: 'text', status: 'removed' };
    return {
      by,
      label: field.label,
      group: 'attributes',
      kind: FIELD_KIND_TO_STYLE[field.kind] ?? 'text',
      ...(field.kind === 'enum' && { options: field.values ?? [] }),
      status: 'ok',
    };
  }
  const metric = by.startsWith('metric:') ? METRIC_CATALOGUE.find((m) => m.collection === 'nodes' && m.id === by.slice('metric:'.length)) : undefined;
  if (!metric) return { by, label: 'Removed measured value', group: 'measured', kind: 'text', status: 'removed' };
  return {
    by,
    label: metric.label,
    group: 'measured',
    kind: METRIC_KIND_TO_STYLE[metric.valueKind] ?? 'text',
    ...(metric.unit && { unit: metric.unit }),
    status: shownMetrics === undefined || shownMetrics.includes(metric.id) ? 'ok' : 'hidden',
  };
}

/**
 * The "Style rooms by" selector: Function and Level, every custom node attribute (by label), and
 * the measured node values shown in Attributes. The attribute in use is always listed, also when
 * it was removed or is no longer shown (marked by its `status`).
 */
export function styleAttributes(schema: ProjectAttributeSchema, shownMetrics: EnabledMetricIds, current: StyleBy): StyleAttribute[] {
  const out: StyleAttribute[] = [...ROOM_ATTRIBUTES];
  for (const field of schema.nodes) out.push(styleAttributeOf(`attribute:${field.id}`, schema, shownMetrics));
  for (const metric of METRIC_CATALOGUE) {
    if (metric.collection === 'nodes' && shownMetrics.includes(metric.id)) out.push(styleAttributeOf(`metric:${metric.id}`, schema, shownMetrics));
  }
  if (!out.some((a) => a.by === current)) out.push(styleAttributeOf(current, schema, shownMetrics));
  return out;
}

/** Selector text of an attribute ("Area (m²)", "Area (m²) (not in Attributes)"). */
export function styleAttributeName(a: StyleAttribute): string {
  const unit = a.unit ? ` (${a.unit})` : '';
  return a.status === 'hidden' ? `${a.label}${unit} (not in Attributes)` : `${a.label}${unit}`;
}

/** Numbers in plain text: at most two decimals ("37.5", "120"). */
export const formatNumber = (value: number): string => String(Math.round(value * 100) / 100);

/** A value card's name: the function, the option or text, Yes / No, "Level 2" or "120 m²". */
export function valueName(attribute: Pick<StyleAttribute, 'unit' | 'level'>, value: StyleValue): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return attribute.level ? `Level ${formatNumber(value)}` : `${formatNumber(value)}${attribute.unit ? ` ${attribute.unit}` : ''}`;
  return value;
}

/** Noun of the "+ Style another …" menu. */
export const addNoun = (a: Pick<StyleAttribute, 'kind' | 'level'>): string =>
  a.kind === 'function' ? 'function' : a.level ? 'level' : a.kind === 'choice' ? 'option' : 'value';

export interface DesignerCardRow {
  /** Stable key for element ids and remembered open state ("default", "v:gallery", "b:0"). */
  readonly key: string;
  readonly target: CardTarget;
  /** Function cards: the type id (swatch colour, façade fit warning); otherwise null. */
  readonly typeId: string | null;
  /** Card title, e.g. "Default", "Gallery (gallery)". */
  readonly name: string;
  /** The rooms this card styles now (each room is in exactly one card). */
  readonly nodeIds: readonly number[];
  readonly effective: EffectiveLook;
  /** What the window coverage falls back to when the card does not set it, as text. */
  readonly inheritedWindowText: string;
  /** The fraction an unset window coverage falls back to. */
  readonly inheritedWindowFraction: number;
  /** The card stores something (Reset available). */
  readonly hasOverride: boolean;
  /** Value cards can be removed; Default cannot. */
  readonly removable: boolean;
  readonly warning: string | null;
}

export interface DesignerCards {
  readonly by: StyleBy;
  readonly byLabel: string;
  readonly attribute: StyleAttribute;
  /** Numbers: value cards or bands; other kinds: null (value cards). */
  readonly mode: StyleMode | null;
  readonly defaultCard: DesignerCardRow;
  readonly cards: readonly DesignerCardRow[];
  /**
   * Values without a card, with their room counts, for "+ Style another …" (Function, Choice,
   * Yes/No, numbers) or as suggestions for the text box (Text).
   */
  readonly addable: readonly { readonly value: StyleValue; readonly label: string; readonly nodeCount: number }[];
  /** Bands: the stored dividers (ascending); otherwise null. */
  readonly dividers: readonly number[] | null;
  /** Numbers: every room's value (rooms without one are left out), for the bands track. */
  readonly numbers: readonly number[];
  /** Rooms without a value (they use Default). */
  readonly missingCount: number;
}

const cardKey = (group: StyleGroupRef): string =>
  group.kind === 'default' ? 'default' : group.kind === 'band' ? `b:${group.index}` : `v:${String(group.value)}`;

/** Example window coverage shown when the rooms of a card have different functions. */
const MIXED_BASE = 0.25;

/** The single toolkit window coverage of these rooms, or null when their functions' defaults differ. */
function sharedBase(doc: DesignDocumentV2, nodeIds: readonly number[], facade: FacadeProvider): number | null {
  const ids = new Set(nodeIds);
  const values = new Set(doc.nodes.filter((n) => ids.has(n.id)).map((n) => facade(n.typeId).windowFraction));
  return values.size === 1 ? [...values][0]! : null;
}

/**
 * A band's name in plain words: "Under 50 m²", "50 – 100 m²", "100 m² or more"; Level bands name
 * whole storeys: "Up to level 0", "Level 1", "Levels 1–2", "Level 3 and above".
 */
export function bandName(dividers: readonly number[], index: number, attribute: Pick<StyleAttribute, 'unit' | 'level'> = {}): string {
  const lo = dividers[index - 1];
  const hi = dividers[index];
  if (attribute.level) {
    // Level dividers are whole storeys: band [lo, hi) holds levels lo … hi − 1.
    if (lo === undefined) return hi === undefined ? 'Every level' : `Up to level ${formatNumber(Math.ceil(hi) - 1)}`;
    if (hi === undefined) return `Level ${formatNumber(Math.ceil(lo))} and above`;
    const first = Math.ceil(lo);
    const last = Math.ceil(hi) - 1;
    return first >= last ? `Level ${formatNumber(first)}` : `Levels ${formatNumber(first)}–${formatNumber(last)}`;
  }
  const u = attribute.unit ? ` ${attribute.unit}` : '';
  if (lo === undefined) return hi === undefined ? 'All values' : `Under ${formatNumber(hi)}${u}`;
  if (hi === undefined) return `${formatNumber(lo)}${u} or more`;
  return `${formatNumber(lo)} – ${formatNumber(hi)}${u}`;
}

/**
 * The Designer cards of `doc`: Default plus one card per stored value / band of the active
 * "Style rooms by" attribute, each with the rooms it styles now. `values` supplies attribute /
 * measured values (not needed for Function and Level).
 */
export function designerCards(
  doc: DesignDocumentV2,
  project: ActiveToolkit | null,
  facade: FacadeProvider,
  values?: StyleValues,
  attribute: StyleAttribute = styleAttributeOf(doc.settings.styleBy),
): DesignerCards {
  const by = doc.settings.styleBy;
  const setup = styleSetupOf(doc.settings, by);
  const isNumber = attribute.kind === 'number';
  const mode: StyleMode | null = isNumber ? styleModeOf(setup) : null;
  const looks = nodeLooks(doc, facade, values);
  const roomsOf = (group: StyleGroupRef) => doc.nodes.filter((n) => sameGroup(looks.get(n.id)!.group, group)).map((n) => n.id);
  const types = by === FUNCTION ? designerTypeRows(doc, project, facade) : [];

  const row = (group: StyleGroupRef, name: string, typeId: string | null, warning: string | null): DesignerCardRow => {
    const target: CardTarget = { by, group, name: typeId ?? name };
    const nodeIds = roomsOf(group);
    const own = typeId !== null ? facade(typeId).windowFraction : sharedBase(doc, nodeIds, facade);
    const base = own ?? MIXED_BASE;
    const inherited = inheritedFor(doc, target, base);
    const fromDefault = group.kind !== 'default' && inherited.source.windowFraction === 'default';
    const stored = storedLook(doc, target);
    return {
      key: cardKey(group),
      target,
      typeId,
      name,
      nodeIds,
      effective: effectiveFor(doc, target, base),
      inheritedWindowFraction: inherited.windowFraction,
      inheritedWindowText: fromDefault
        ? `Default, ${formatPercent(inherited.windowFraction)} %`
        : own === null
          ? "each function's own default"
          : `${typeId === null ? 'function' : 'project'} default, ${formatPercent(own)} %`,
      // A value card exists only when added (so it counts as a change); Default and bands always exist.
      hasOverride: stored !== undefined && (group.kind === 'value' || Object.keys(stored).length > 0),
      removable: group.kind === 'value',
      warning,
    };
  };

  const defaultCard = row(DEFAULT_GROUP, 'Default', null, null);
  const cards: DesignerCardRow[] = [];
  const bandsActive = mode === 'bands' && hasBands(setup);
  if (bandsActive) {
    setup.bands!.forEach((_, index) => cards.push(row({ kind: 'band', index }, bandName(setup.dividers!, index, attribute), null, null)));
  } else {
    const optionKeys = attribute.kind === 'choice' ? new Set((attribute.options ?? []).map(styleValueKey)) : null;
    for (const g of setup.groups ?? []) {
      const group: StyleGroupRef = { kind: 'value', value: g.value };
      if (attribute.kind === 'function') {
        const typeId = String(g.value);
        const t = types.find((r) => r.typeId === typeId);
        cards.push(row(group, t?.name ?? typeId, typeId, t?.warning ?? null));
      } else {
        const notAnOption = optionKeys !== null && !optionKeys.has(styleValueKey(g.value));
        cards.push(row(group, valueName(attribute, g.value), null, notAnOption ? `“${String(g.value)}” is no longer an option of ${attribute.label}, so no room uses this card.` : null));
      }
    }
  }

  // Each room's value (Function and Level from the document, the rest from `values`).
  const roomValues = doc.nodes.map((n) => styleValueOfNode(n, by, values));
  const present = roomValues.filter(
    (v): v is StyleValue => (typeof v === 'string' && v.trim() !== '') || (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean',
  );
  const counts = new Map<string, { value: StyleValue; count: number }>();
  for (const v of present) {
    const key = styleValueKey(v);
    const entry = counts.get(key);
    if (entry) entry.count++;
    else counts.set(key, { value: typeof v === 'string' ? v.trim() : v, count: 1 });
  }
  const carded = new Set((setup.groups ?? []).map((g) => styleValueKey(g.value)));
  const countOf = (v: StyleValue) => counts.get(styleValueKey(v))?.count ?? 0;
  let addable: { value: StyleValue; label: string; nodeCount: number }[];
  if (attribute.kind === 'function') {
    addable = types.filter((t) => !carded.has(styleValueKey(t.typeId))).map((t) => ({ value: t.typeId, label: t.name, nodeCount: t.nodeCount }));
  } else if (attribute.kind === 'choice') {
    addable = (attribute.options ?? []).filter((o) => !carded.has(styleValueKey(o))).map((o) => ({ value: o, label: o, nodeCount: countOf(o) }));
  } else if (attribute.kind === 'yesno') {
    addable = [true, false].filter((v) => !carded.has(styleValueKey(v))).map((v) => ({ value: v, label: valueName(attribute, v), nodeCount: countOf(v) }));
  } else {
    const entries = [...counts.entries()].filter(([key]) => !carded.has(key)).map(([, e]) => e);
    if (isNumber) entries.sort((a, b) => (a.value as number) - (b.value as number));
    else entries.sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)));
    addable = entries.map((e) => ({ value: e.value, label: valueName(attribute, e.value), nodeCount: e.count }));
  }
  return {
    by,
    byLabel: attribute.label,
    attribute,
    mode,
    defaultCard,
    cards,
    addable,
    dividers: bandsActive ? setup.dividers! : null,
    numbers: isNumber ? present.filter((v): v is number => typeof v === 'number') : [],
    missingCount: roomValues.length - present.length,
  };
}

/** The finite number of every room for `by`. */
function numbersOf(doc: DesignDocumentV2, by: StyleBy, values?: StyleValues): number[] {
  return doc.nodes.map((n) => styleValueOfNode(n, by, values)).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

/**
 * Style rooms by `attribute`. A number (not Level) that has no setup yet starts with suggested
 * bands in the same undo step (`values`: that attribute's room values).
 */
export function styleByEdit(doc: DesignDocumentV2, attribute: StyleAttribute, values?: StyleValues): DesignerEdit {
  if (attribute.by === doc.settings.styleBy) return UNCHANGED;
  const label = `Style rooms by ${attribute.label}`;
  const fresh = !Object.prototype.hasOwnProperty.call(doc.settings.styles, attribute.by);
  if (attribute.kind === 'number' && !attribute.level && fresh) {
    const numbers = numbersOf(doc, attribute.by, values);
    const dividers = suggestDividers(numbers, { integer: wholeNumbers(attribute, numbers) });
    return { kind: 'command', command: { type: 'set-style-by', by: attribute.by, dividers }, label };
  }
  return { kind: 'command', command: { type: 'set-style-by', by: attribute.by }, label };
}

/** Switch a number between one card per value and bands; bands start with suggested dividers. */
export function styleModeEdit(doc: DesignDocumentV2, attribute: StyleAttribute, mode: StyleMode, values?: StyleValues): DesignerEdit {
  const setup = styleSetupOf(doc.settings, attribute.by);
  if (styleModeOf(setup) === mode) return UNCHANGED;
  const label = mode === 'bands' ? `Style ${attribute.label} by bands` : `Style ${attribute.label} by one card per value`;
  const dividers = mode === 'bands' && !hasBands(setup) ? suggestDividers(numbersOf(doc, attribute.by, values), { integer: wholeNumbers(attribute, numbersOf(doc, attribute.by, values)) }) : undefined;
  return { kind: 'command', command: { type: 'set-style-mode', by: attribute.by, mode, ...(dividers && { dividers }) }, label };
}

/** New band dividers (ascending, distinct; Level: whole storeys). */
export function bandDividersEdit(doc: DesignDocumentV2, attribute: StyleAttribute, dividers: readonly number[]): DesignerEdit {
  const next = attribute.level ? dividers.map((d) => Math.round(d)) : [...dividers];
  if (next.some((d) => !Number.isFinite(d))) return { kind: 'invalid', message: 'A divider must be a number.' };
  for (let i = 1; i < next.length; i++) {
    if (!(next[i]! > next[i - 1]!)) return { kind: 'invalid', message: 'Each divider must be larger than the one before it.' };
  }
  const stored = styleSetupOf(doc.settings, attribute.by).dividers ?? [];
  if (stored.length === next.length && stored.every((d, i) => d === next[i])) return UNCHANGED;
  return { kind: 'command', command: { type: 'set-band-dividers', by: attribute.by, dividers: next }, label: `Change the ${attribute.label} bands` };
}

/** Range shown on the bands track: the room values and the dividers, with a small margin; never empty. */
export function bandTrackRange(numbers: readonly number[], dividers: readonly number[]): { readonly min: number; readonly max: number } {
  const all = [...numbers, ...dividers];
  if (all.length === 0) return { min: 0, max: 10 };
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  // A margin so the first and last bands stay wide enough to see (and to grab their dividers).
  const pad = (max - min) * 0.12;
  return { min: min - pad, max: max + pad };
}

/** The step dividers move by (keyboard, dragging): a round number; whole for whole-number values. */
/** Dividers move in whole steps: Level, or a number every room has a whole value of (Degree, a count). */
export const wholeNumbers = (attribute: Pick<StyleAttribute, 'level'>, numbers: readonly number[]): boolean =>
  !!attribute.level || (numbers.length > 0 && numbers.every(Number.isInteger));

export const bandStep = (range: { readonly min: number; readonly max: number }, whole?: boolean): number =>
  whole ? Math.max(1, Math.round(niceStep((range.max - range.min) / 5))) : niceStep((range.max - range.min) / 5);

/**
 * The dividers with one more, splitting the widest band (on the track) at a round value; null
 * when no band can be split (e.g. Level bands of one storey each).
 */
export function withAddedDivider(numbers: readonly number[], dividers: readonly number[], whole?: boolean): number[] | null {
  const range = bandTrackRange(numbers, dividers);
  const step = bandStep(range, whole);
  const edges = [range.min, ...dividers, range.max];
  const bands = edges
    .slice(1)
    .map((hi, i) => ({ lo: edges[i]!, hi }))
    .sort((a, b) => b.hi - b.lo - (a.hi - a.lo));
  // When the rooms' values differ, a new divider lies within them (above the lowest), so it never
  // makes a band nobody can be in. With one value (or none) any split is allowed: bands set up ahead.
  const lowest = Math.min(...numbers);
  const highest = Math.max(...numbers);
  const inside = (d: number) => !(highest > lowest) || (d > lowest && d <= highest);
  for (const { lo, hi } of bands) {
    let d = roundToStep((lo + hi) / 2, step);
    if (!(d > lo && d < hi)) d = (lo + hi) / 2;
    if (whole) d = Math.round(d);
    if (d > lo && d < hi && inside(d) && !dividers.includes(d)) return [...dividers, d].sort((a, b) => a - b);
  }
  return null;
}

/**
 * Add a card for `value`: an empty card, so its rooms keep their look until something is changed.
 * Text is trimmed (empty text is refused); a card that exists already (ignoring case) is unchanged.
 */
export function addCardEdit(doc: DesignDocumentV2, by: StyleBy, value: StyleValue, name = String(value)): DesignerEdit {
  const v = typeof value === 'string' ? value.trim() : value;
  if (v === '') return { kind: 'invalid', message: 'Type a value first.' };
  if (typeof v === 'string' && v.length > 200) return { kind: 'invalid', message: 'A value can be at most 200 characters.' };
  if (lookOfGroup(styleSetupOf(doc.settings, by), { kind: 'value', value: v }) !== undefined) return UNCHANGED;
  return { kind: 'command', command: { type: 'set-look', by, group: { kind: 'value', value: v }, patch: {} }, label: `Add a Designer card for ${name.trim()}` };
}

/** Remove a value card: its rooms use Default again. */
export function removeCardEdit(doc: DesignDocumentV2, target: CardTarget): DesignerEdit {
  if (target.group.kind !== 'value' || storedLook(doc, target) === undefined) return UNCHANGED;
  return { kind: 'command', command: { type: 'remove-style-group', by: target.by, value: target.group.value }, label: `Remove the Designer card for ${target.name}` };
}

/** Result of turning a Designer interaction into a command. */
export type DesignerEdit =
  | { readonly kind: 'command'; readonly command: DesignCommand; readonly label: string }
  /** Nothing would change: send nothing (no empty history step). */
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'invalid'; readonly message: string };

const UNCHANGED: DesignerEdit = Object.freeze({ kind: 'unchanged' });

/** Fractions are kept to 4 decimals so percentages like 35 % store as 0.35, not 0.35000000000000003. */
export const roundFraction = (fraction: number): number => Math.round(fraction * 10000) / 10000;

/** Percent text for a fraction: 0.35 → "35", 0.125 → "12.5". */
export const formatPercent = (fraction: number): string => String(Math.round(fraction * 1000) / 10);

/**
 * Parse a window coverage typed as a percentage ("35", "35 %", "12.5"). Returns a fraction in
 * [0, 1] or a readable error; values outside 0–100 % are rejected, never clamped silently.
 */
export function parseWindowPercent(text: string): { ok: true; fraction: number } | { ok: false; message: string } {
  const trimmed = text.trim().replace(/\s*%$/, '');
  if (trimmed === '' || !/^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(trimmed)) {
    return { ok: false, message: 'Enter a window coverage between 0 and 100 %.' };
  }
  const percent = Number(trimmed);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    return { ok: false, message: 'Window coverage must be between 0 and 100 %.' };
  }
  return { ok: true, fraction: roundFraction(percent / 100) };
}

const current = (doc: DesignDocumentV2, t: CardTarget): Look => storedLook(doc, t) ?? {};

/**
 * Set a card's window coverage (fraction 0–1, exterior walls only). `inherited` is the toolkit
 * value the card falls back to when neither it nor Default sets one.
 */
export function setWindowFractionEdit(doc: DesignDocumentV2, card: string | CardTarget, fraction: number, inherited: number): DesignerEdit {
  const t = targetOf(card);
  const checked = windowFractionSchema.safeParse(fraction);
  if (!checked.success) return { kind: 'invalid', message: 'Window coverage must be a number between 0 and 1 (0–100 %).' };
  const value = roundFraction(fraction);
  const stored = current(doc, t).windowFraction;
  // Unchanged: the same stored value, or nothing stored and the value equals what is inherited.
  if (stored !== undefined ? stored === value : value === roundFraction(effectiveFor(doc, t, inherited).windowFraction)) return UNCHANGED;
  return { kind: 'command', command: lookCommand(t, { windowFraction: value }), label: `Set ${t.name} window coverage to ${formatPercent(value)} %` };
}

/** Set a card's roof (applies to exposed upward faces only; Building draws it). */
export function setRoofEdit(doc: DesignDocumentV2, card: string | CardTarget, roof: string): DesignerEdit {
  const t = targetOf(card);
  if (!(ROOF_STYLES as readonly string[]).includes(roof)) {
    return { kind: 'invalid', message: `Roof must be one of: ${ROOF_STYLES.join(', ')}.` };
  }
  const stored = current(doc, t).roof;
  if (stored !== undefined ? stored === roof : effectiveFor(doc, t).roof === roof) return UNCHANGED;
  return { kind: 'command', command: lookCommand(t, { roof: roof as RoofStyle }), label: `Set ${t.name} roof to ${roof}` };
}

/** Set a card's window placement (Repeat or Stretch). */
export function setWindowLayoutEdit(doc: DesignDocumentV2, card: string | CardTarget, layout: string): DesignerEdit {
  const t = targetOf(card);
  if (!(WINDOW_LAYOUTS as readonly string[]).includes(layout)) {
    return { kind: 'invalid', message: `Window layout must be one of: ${WINDOW_LAYOUTS.join(', ')}.` };
  }
  const stored = current(doc, t).windowLayout;
  if (stored !== undefined ? stored === layout : effectiveFor(doc, t).windowLayout === layout) return UNCHANGED;
  return {
    kind: 'command',
    command: lookCommand(t, { windowLayout: layout as WindowLayout }),
    label: `Set ${t.name} windows to ${WINDOW_LAYOUT_LABELS[layout as WindowLayout]}`,
  };
}

/** Set whether a card's rooms have exterior walls (Enclosed) or not (Open). */
export function setWallsEdit(doc: DesignDocumentV2, card: string | CardTarget, walls: string): DesignerEdit {
  const t = targetOf(card);
  if (!(WALL_STYLES as readonly string[]).includes(walls)) {
    return { kind: 'invalid', message: `Walls must be one of: ${WALL_STYLES.join(', ')}.` };
  }
  const stored = current(doc, t).walls;
  if (stored !== undefined ? stored === walls : effectiveFor(doc, t).walls === walls) return UNCHANGED;
  return { kind: 'command', command: lookCommand(t, { walls: walls as WallStyle }), label: `Set ${t.name} walls to ${WALL_LABELS[walls as WallStyle]}` };
}

/**
 * Clear what a card sets (one field or all): its rooms inherit again. With a plain type id (the
 * older per-function call), clearing everything removes the function's card; a card target keeps
 * the card (use `removeCardEdit`); Default is just emptied.
 */
export function resetTypeEdit(
  doc: DesignDocumentV2,
  card: string | CardTarget,
  field: 'windowFraction' | 'windowLayout' | 'walls' | 'roof' | 'facade' | 'all' = 'all',
): DesignerEdit {
  const t = targetOf(card);
  const own = current(doc, t);
  const clearWindow = (field === 'all' || field === 'windowFraction') && own.windowFraction !== undefined;
  const clearLayout = (field === 'all' || field === 'windowLayout') && own.windowLayout !== undefined;
  const clearWalls = (field === 'all' || field === 'walls') && own.walls !== undefined;
  const clearRoof = (field === 'all' || field === 'roof') && own.roof !== undefined;
  const clearFacade = (field === 'all' || field === 'facade') && own.facade !== undefined;
  const label = t.group.kind === 'default' ? 'Reset Default' : `Reset ${t.name} appearance`;
  const keeps = (key: keyof Look, cleared: boolean) => own[key] !== undefined && !cleared;
  const nothingLeft = !keeps('windowFraction', clearWindow) && !keeps('windowLayout', clearLayout) && !keeps('walls', clearWalls) && !keeps('roof', clearRoof) && !keeps('facade', clearFacade);
  if (typeof card === 'string' && t.group.kind === 'value' && storedLook(doc, t) !== undefined && nothingLeft) {
    return { kind: 'command', command: { type: 'remove-style-group', by: t.by, value: t.group.value }, label };
  }
  if (!clearWindow && !clearLayout && !clearWalls && !clearRoof && !clearFacade) return UNCHANGED;
  return {
    kind: 'command',
    command: lookCommand(t, {
      ...(clearWindow ? { windowFraction: null } : {}),
      ...(clearLayout ? { windowLayout: null } : {}),
      ...(clearWalls ? { walls: null } : {}),
      ...(clearRoof ? { roof: null } : {}),
      ...(clearFacade ? { facade: null } : {}),
    }),
    label,
  };
}

// ---------------------------------------------------------------------------------------------
// Imported façades (3DM modules, 2026-11-17)

/** A card's façade in the Designer: none, or an imported module. */
export type FacadeChoice = { readonly kind: 'none' } | { readonly kind: 'module'; readonly module: FacadeModule };

/** The stored choice of a card (what the menu shows). */
export function facadeChoiceOf(doc: DesignDocumentV2, card: string | CardTarget): FacadeChoice {
  const own = current(doc, targetOf(card)).facade;
  return own === undefined || own === 'none' ? { kind: 'none' } : { kind: 'module', module: own };
}

const sameModule = sameFacadeModule;

/** Set (or clear, `none`) the façade of a card. */
export function setFacadeEdit(doc: DesignDocumentV2, card: string | CardTarget, choice: FacadeChoice, assetName?: string): DesignerEdit {
  const t = targetOf(card);
  const stored = facadeChoiceOf(doc, t);
  if (choice.kind === stored.kind && (choice.kind !== 'module' || (stored.kind === 'module' && sameModule(choice.module, stored.module)))) return UNCHANGED;
  const patch = choice.kind === 'none' ? (inheritedFor(doc, t).facade ? ('none' as const) : null) : canonicalFacadeModule(choice.module);
  const what = choice.kind === 'none' ? 'no imported façade' : `${assetName ?? 'an imported façade'} (${FACADE_PLACEMENT_LABELS[choice.module.placement]})`;
  return { kind: 'command', command: lookCommand(t, { facade: patch }), label: `Set ${t.name} to ${what}` };
}

/**
 * Façade geometry of a card (owner 2026-11-17), one control over two stored fields:
 * - `open`: no exterior walls (`walls: 'open'`);
 * - `automatic`: enclosed walls with the Designer's windows (no imported façade);
 * - `import`: enclosed walls replaced by an imported 3DM module (`facade`).
 */
export type FacadeMode = 'open' | 'automatic' | 'import';
export const FACADE_MODES: readonly FacadeMode[] = ['open', 'automatic', 'import'];
export const FACADE_MODE_LABELS: Readonly<Record<FacadeMode, string>> = { open: 'Open', automatic: 'Automatic', import: 'Import' };
export const FACADE_MODE_HELP: Readonly<Record<FacadeMode, string>> = {
  open: 'No exterior walls (pavilion, pergola, terrace); walls shared with other rooms stay',
  automatic: 'Exterior walls with windows set here (coverage and layout)',
  import: 'Exterior walls replaced by a façade module imported from Rhino (.3dm)',
};

/** The effective mode of a card. */
export function facadeModeOf(doc: DesignDocumentV2, card: string | CardTarget): FacadeMode {
  const effective = effectiveFor(doc, targetOf(card));
  if (effective.walls === 'open') return 'open';
  return effective.facade ? 'import' : 'automatic';
}

/**
 * Switch the façade geometry in ONE command (one undo step). `import` needs the module to use
 * (`module`). The card stores only what differs from what it inherits (Default): Automatic under
 * an Open Default stores `walls: 'enclosed'`, and under an imported Default `facade: 'none'`.
 */
export function setFacadeModeEdit(doc: DesignDocumentV2, card: string | CardTarget, mode: FacadeMode, module?: FacadeModule, assetName?: string): DesignerEdit {
  const t = targetOf(card);
  if (mode === 'import' && !module) return { kind: 'invalid', message: 'Choose or import a façade first.' };
  const inherited = inheritedFor(doc, t);
  const own = current(doc, t);
  const wantWalls: WallStyle = mode === 'open' ? 'open' : 'enclosed';
  const walls: WallStyle | null = inherited.walls === wantWalls ? null : wantWalls;
  const facade: FacadeModule | 'none' | null = mode === 'import' ? canonicalFacadeModule(module!) : inherited.facade ? 'none' : null;
  const ownFacade = own.facade ?? null;
  const sameFacade =
    facade === null || facade === 'none' ? ownFacade === facade : ownFacade !== null && ownFacade !== 'none' && sameModule(ownFacade, facade);
  if ((own.walls ?? null) === walls && sameFacade) return UNCHANGED;
  const label =
    mode === 'import' ? `Set ${t.name} façade to ${assetName ?? 'an imported façade'}` : mode === 'open' ? `Set ${t.name} to open sides` : `Set ${t.name} to automatic façade`;
  return { kind: 'command', command: lookCommand(t, { walls, facade }), label };
}

export const FACADE_PLACEMENT_LABELS: Readonly<Record<FacadePlacement, string>> = {
  repeat: 'Repeat',
  stretch: 'Stretch',
};

export const FACADE_PLACEMENT_HELP: Readonly<Record<FacadePlacement, string>> = {
  repeat: 'One module per 3 m bay of every exterior wall, fitted to the bay (draw the module 3 m wide and one storey high).',
  stretch: 'One module across each wall run: the contiguous exterior bays of a room on one storey (draw it at the run’s length).',
};

/** One sentence for a function's fit warning, or null (≤ 5 % scaling everywhere). */
export function distortionMessage(instances: readonly FacadeModuleInstance[], owner: string | ReadonlySet<number>): string | null {
  const d = distortedModules(instances, owner);
  if (!d) return null;
  const range = (lo: number, hi: number) => (Math.abs(hi - lo) < 0.005 ? `×${lo.toFixed(2)}` : `×${lo.toFixed(2)}–${hi.toFixed(2)}`);
  const parts = [
    Math.abs(d.minAlong - 1) > 0.05 || Math.abs(d.maxAlong - 1) > 0.05 ? `${range(d.minAlong, d.maxAlong)} along the wall` : '',
    Math.abs(d.minUp - 1) > 0.05 || Math.abs(d.maxUp - 1) > 0.05 ? `${range(d.minUp, d.maxUp)} upward` : '',
  ].filter(Boolean);
  return `${d.count} ${d.count === 1 ? 'module is' : 'modules are'} stretched ${parts.join(' and ')} to fit. Draw the module at the size it is used, or switch Repeat / Stretch.`;
}

export const WINDOW_LAYOUT_LABELS: Readonly<Record<WindowLayout, string>> = {
  repeat: 'Repeat',
  stretch: 'Stretch',
};

export const WALL_LABELS: Readonly<Record<WallStyle, string>> = {
  enclosed: 'Enclosed',
  open: 'Open',
};

export const ROOF_LABELS: Readonly<Record<RoofStyle, string>> = {
  flat: 'Flat',
  pergola: 'Pergola (open slats)',
  none: 'None (open top)',
};

export const CONNECTOR_STYLE_LABELS: Readonly<Record<ConnectorStyle, string>> = {
  enclosed: 'Enclosed',
  covered: 'Covered',
  deck: 'Deck',
};

/** Read-only summary of the selected relationship, so the Designer can point to Properties. */
export interface SelectedRelationshipSummary {
  readonly edgeId: number;
  /** "01 → 02". */
  readonly label: string;
  readonly style: ConnectorStyle;
  readonly styleIsDefault: boolean;
  /** Derived status; the connector style is only built when the relationship is `routed`. */
  readonly status: 'direct' | 'routed' | 'unresolved' | null;
}

export function selectedRelationship(
  doc: DesignDocumentV2,
  selection: Selection | undefined,
  spatial?: Pick<SpatialResolution, 'byEdge'>,
): SelectedRelationshipSummary | null {
  if (selection?.kind !== 'edge') return null;
  const edge = doc.edges.find((e) => e.id === selection.id);
  if (!edge) return null;
  const labelOf = (id: number) => {
    const node = doc.nodes.find((n) => n.id === id);
    return node ? nodeLabel(node) : id;
  };
  return {
    edgeId: edge.id,
    label: `${labelOf(edge.source)} → ${labelOf(edge.target)}`,
    style: connectorStyleOf(edge, doc.settings),
    styleIsDefault: edge.connectorStyle === undefined,
    status: spatial?.byEdge.get(edge.id)?.status ?? null,
  };
}

// ---------------------------------------------------------------------------------------------
// Corridors (2026-11-19): design-wide style and roof of the generated connectors.

/** The Corridors section: effective values and whether the design sets them. */
export interface CorridorsSummary {
  readonly style: ConnectorStyle;
  readonly styleSetHere: boolean;
  readonly roof: RoofStyle;
  readonly roofSetHere: boolean;
  /** The roof is drawn for this style (enclosed, covered); a deck has none. */
  readonly roofApplies: boolean;
  /** Relationships with their own style (Properties), which the design style does not change. */
  readonly overrideCount: number;
}

export function corridorsSummary(doc: DesignDocumentV2): CorridorsSummary {
  const c = doc.settings.corridors;
  const style = corridorStyleOf(doc.settings);
  return {
    style,
    styleSetHere: c?.style !== undefined,
    roof: corridorRoofOf(doc.settings),
    roofSetHere: c?.roof !== undefined,
    roofApplies: style !== 'deck',
    overrideCount: doc.edges.filter((e) => e.connectorStyle !== undefined).length,
  };
}

/** Set the design's corridor style (choosing the effective value while unset stores nothing). */
export function setCorridorStyleEdit(doc: DesignDocumentV2, style: string): DesignerEdit {
  if (!(CONNECTOR_STYLES as readonly string[]).includes(style)) {
    return { kind: 'invalid', message: `Corridor style must be one of: ${CONNECTOR_STYLES.join(', ')}.` };
  }
  if (corridorStyleOf(doc.settings) === style) return UNCHANGED;
  const s = style as ConnectorStyle;
  return { kind: 'command', command: { type: 'set-corridors', patch: { style: s } }, label: `Set corridors to ${CONNECTOR_STYLE_LABELS[s]}` };
}

/** Set the roof of the design's corridors (choosing the effective value while unset stores nothing). */
export function setCorridorRoofEdit(doc: DesignDocumentV2, roof: string): DesignerEdit {
  if (!(ROOF_STYLES as readonly string[]).includes(roof)) {
    return { kind: 'invalid', message: `Roof must be one of: ${ROOF_STYLES.join(', ')}.` };
  }
  if (corridorRoofOf(doc.settings) === roof) return UNCHANGED;
  return { kind: 'command', command: { type: 'set-corridors', patch: { roof: roof as RoofStyle } }, label: `Set the corridor roof to ${roof}` };
}

/** Back to the built-in defaults (Covered, Flat): one step; nothing to do when nothing is set. */
export function resetCorridorsEdit(doc: DesignDocumentV2): DesignerEdit {
  const c = doc.settings.corridors;
  if (c?.style === undefined && c?.roof === undefined) return UNCHANGED;
  return { kind: 'command', command: { type: 'set-corridors', patch: { style: null, roof: null } }, label: 'Reset the corridors' };
}
