import { DEFAULT_CORRIDOR_ROOF, DEFAULT_CORRIDOR_WALLS, DEFAULT_ROOF_STYLE, DEFAULT_WALL_STYLE, DEFAULT_WINDOW_LAYOUT, FACADE_VARIANTS, type RoofStyle, type WallStyle, type WindowLayout } from './constants';
import {
  styleValueKey,
  type CorridorLook,
  type DesignDocumentV2,
  type DesignSettings,
  type FacadeModule,
  type Look,
  type RoomNode,
  type StyleBy,
  type StyleMode,
  type StyleSetup,
  type StyleValue,
} from './schema';

/**
 * Room looks — "Style rooms by" (owner 2026-11-18; replaced the per-function `typeAppearance`).
 *
 * The rooms of a design are styled by ONE attribute (`settings.styleBy`). Its setup has a Default
 * look plus either value cards (`groups`) or number bands (`dividers` + `bands`). Every room falls
 * in exactly ONE group: the card or band its value matches, else Default (also when it has no
 * value). Each look field resolves card → Default → the toolkit's per-function default (window
 * coverage only) → built-in. Pure; resolved on read, never written into the document.
 *
 * Function and Level are read from the document. Custom attributes and measured values live in
 * higher layers, so the caller passes them as `values` (node id → value).
 */

/** What the toolkit says about a room's function (normally `FacadeProvider(functionId)` from app/building). */
export interface ProjectTypeDefaults {
  readonly windowFraction: number;
}

/** Where an effective look field came from. */
export type LookSource = 'card' | 'default' | 'base';

export interface EffectiveLook {
  readonly windowFraction: number;
  readonly windowLayout: WindowLayout;
  readonly walls: WallStyle;
  readonly roof: RoofStyle;
  /** Imported façade module, or null. */
  readonly facade: FacadeModule | null;
  readonly source: {
    readonly windowFraction: LookSource;
    readonly windowLayout: LookSource;
    readonly walls: LookSource;
    readonly roof: LookSource;
    readonly facade: LookSource;
  };
}

/** One card of a setup. */
export type StyleGroupRef =
  | { readonly kind: 'default' }
  | { readonly kind: 'value'; readonly value: StyleValue }
  | { readonly kind: 'band'; readonly index: number };

export const DEFAULT_GROUP: StyleGroupRef = Object.freeze({ kind: 'default' });

const EMPTY_SETUP: StyleSetup = Object.freeze({});
const EMPTY_LOOK: Look = Object.freeze({});

/** The stored setup of `by` (the active attribute when omitted); an empty setup when none is stored. */
export function styleSetupOf(settings: Pick<DesignSettings, 'styleBy' | 'styles'>, by: StyleBy = settings.styleBy): StyleSetup {
  return Object.prototype.hasOwnProperty.call(settings.styles, by) ? settings.styles[by]! : EMPTY_SETUP;
}

/** The setup stores number bands (they may be inactive: see `styleModeOf`). */
export const hasBands = (setup: StyleSetup): boolean => setup.dividers !== undefined && setup.bands !== undefined;

/** Which of a setup's card kinds is active: bands when stored, unless `mode` says value cards. */
export const styleModeOf = (setup: StyleSetup): StyleMode => (setup.mode ?? (hasBands(setup) ? 'bands' : 'values'));

/** The setup styles rooms by number bands (stored and active). */
export const usesBands = (setup: StyleSetup): boolean => hasBands(setup) && styleModeOf(setup) === 'bands';

/** Index of the band holding `value`: band i = [dividers[i-1], dividers[i]). */
export function bandIndex(dividers: readonly number[], value: number): number {
  let i = 0;
  while (i < dividers.length && value >= dividers[i]!) i++;
  return i;
}

/** A value the evaluator can match: text, a finite number or Yes/No; anything else is "no value". */
const matchable = (value: unknown): value is StyleValue =>
  (typeof value === 'string' && value.trim() !== '') || (typeof value === 'number' && Number.isFinite(value)) || typeof value === 'boolean';

/** The card a value falls in. Bands for numbers when the setup has them; otherwise value cards; else Default. */
export function groupOfValue(setup: StyleSetup, value: unknown): StyleGroupRef {
  if (!matchable(value)) return DEFAULT_GROUP;
  if (usesBands(setup)) return typeof value === 'number' ? { kind: 'band', index: bandIndex(setup.dividers!, value) } : DEFAULT_GROUP;
  const key = styleValueKey(value);
  const group = setup.groups?.find((g) => styleValueKey(g.value) === key);
  return group ? { kind: 'value', value: group.value } : DEFAULT_GROUP;
}

/** The stored look of a card (undefined: the card does not exist). Default always exists. */
export function lookOfGroup(setup: StyleSetup, ref: StyleGroupRef): Look | undefined {
  switch (ref.kind) {
    case 'default':
      return setup.default ?? EMPTY_LOOK;
    case 'value': {
      const key = styleValueKey(ref.value);
      return setup.groups?.find((g) => styleValueKey(g.value) === key)?.look;
    }
    case 'band':
      return usesBands(setup) ? setup.bands![ref.index] : undefined;
  }
}

/** Effective look of a card for a room whose toolkit default is `base`. */
export function effectiveLook(setup: StyleSetup, ref: StyleGroupRef, base: ProjectTypeDefaults): EffectiveLook {
  const card = ref.kind === 'default' ? EMPTY_LOOK : (lookOfGroup(setup, ref) ?? EMPTY_LOOK);
  const fallback = setup.default ?? EMPTY_LOOK;
  const pick = <K extends keyof Look>(key: K): { value: Look[K]; source: LookSource } =>
    card[key] !== undefined ? { value: card[key], source: 'card' } : fallback[key] !== undefined ? { value: fallback[key], source: 'default' } : { value: undefined, source: 'base' };
  const wf = pick('windowFraction');
  const layout = pick('windowLayout');
  const walls = pick('walls');
  const roof = pick('roof');
  const facade = pick('facade');
  return {
    windowFraction: wf.value ?? base.windowFraction,
    windowLayout: layout.value ?? DEFAULT_WINDOW_LAYOUT,
    walls: walls.value ?? DEFAULT_WALL_STYLE,
    roof: roof.value ?? DEFAULT_ROOF_STYLE,
    facade: facade.value === undefined || facade.value === 'none' ? null : facade.value,
    source: { windowFraction: wf.source, windowLayout: layout.source, walls: walls.source, roof: roof.source, facade: facade.source },
  };
}

/** Node id → value of the styling attribute, for attributes the document cannot read itself. */
export type StyleValues = ReadonlyMap<number, unknown>;

/** The value of `by` for one room: Function and Level from the document; anything else from `values`. */
export function styleValueOfNode(node: Pick<RoomNode, 'id' | 'function' | 'position'>, by: StyleBy, values?: StyleValues): unknown {
  if (by === 'function') return node.function;
  if (by === 'level') return node.position[2];
  return values?.get(node.id);
}

export interface NodeLook {
  readonly group: StyleGroupRef;
  readonly look: EffectiveLook;
}

/**
 * Effective look of every room of `doc` under its active `styleBy` (node id → card + look).
 * `base(functionId)` is the toolkit default; `values` supplies attribute / measured values.
 */
export function nodeLooks(
  doc: Pick<DesignDocumentV2, 'nodes' | 'settings'>,
  base: (functionId: string) => ProjectTypeDefaults,
  values?: StyleValues,
): Map<number, NodeLook> {
  const by = doc.settings.styleBy;
  const setup = styleSetupOf(doc.settings, by);
  const out = new Map<number, NodeLook>();
  for (const node of doc.nodes) {
    const group = groupOfValue(setup, styleValueOfNode(node, by, values));
    out.set(node.id, { group, look: effectiveLook(setup, group, base(node.function)) });
  }
  return out;
}

/** Every stored look of every remembered setup (Default, cards, bands), e.g. to find façade asset uses. */
export function* storedLooks(settings: Pick<DesignSettings, 'styles'>): Generator<{ readonly by: StyleBy; readonly group: StyleGroupRef; readonly look: Look }> {
  for (const [by, setup] of Object.entries(settings.styles)) {
    if (setup.default) yield { by, group: DEFAULT_GROUP, look: setup.default };
    for (const g of setup.groups ?? []) yield { by, group: { kind: 'value', value: g.value }, look: g.look };
    for (const [index, look] of (setup.bands ?? []).entries()) yield { by, group: { kind: 'band', index }, look };
  }
}

/** Asset ids a look refers to (its façade and door / open bays). */
export function lookAssetIds(look: Look): string[] {
  const f = look.facade;
  if (!f || f === 'none') return [];
  return [f.assetId, ...FACADE_VARIANTS.flatMap((v) => (f[v] ? [f[v]!.assetId] : []))];
}

/** Same card. */
export const sameGroup = (a: StyleGroupRef, b: StyleGroupRef): boolean =>
  a.kind === b.kind && (a.kind === 'default' || (a.kind === 'value' ? styleValueKey(a.value) === styleValueKey((b as typeof a).value) : a.index === (b as typeof a).index));

// ---------------------------------------------------------------------------------------------
// Corridors (generated straight connectors): the Corridors look card (owner 2026-11-19).

type CorridorSettingsHolder = Pick<DesignSettings, 'corridors'> | undefined;

/** A corridor's resolved look: both fields known. */
export interface EffectiveCorridorLook {
  readonly walls: WallStyle;
  readonly roof: RoofStyle;
}

/** Built-in corridor look: open sides on slim posts under a flat roof. */
export const DEFAULT_CORRIDOR_LOOK: EffectiveCorridorLook = Object.freeze({ walls: DEFAULT_CORRIDOR_WALLS, roof: DEFAULT_CORRIDOR_ROOF });

/** The design's Corridors card, resolved: each field `settings.corridors`, else the built-in default. */
export const designCorridorLook = (settings?: CorridorSettingsHolder): EffectiveCorridorLook => ({
  walls: settings?.corridors?.walls ?? DEFAULT_CORRIDOR_WALLS,
  roof: settings?.corridors?.roof ?? DEFAULT_CORRIDOR_ROOF,
});

/**
 * Effective look of one relationship's corridor, per field: the relationship's own `corridor`
 * (Properties) → the design's Corridors card (`settings.corridors`) → the built-in default
 * (walls `open`, roof `flat`). Pass `undefined` settings only to skip the design step.
 */
export const corridorLookOf = (edge: { readonly corridor?: CorridorLook | undefined }, settings: CorridorSettingsHolder): EffectiveCorridorLook => {
  const design = designCorridorLook(settings);
  return { walls: edge.corridor?.walls ?? design.walls, roof: edge.corridor?.roof ?? design.roof };
};

/** The function cards of a design as `functionId → look` (the `function` setup's value cards). */
export function functionLooks(settings: Pick<DesignSettings, 'styles'>): Record<string, Look> {
  const setup = styleSetupOf({ styleBy: 'function', styles: settings.styles }, 'function');
  return Object.fromEntries((setup.groups ?? []).map((g) => [String(g.value), g.look]));
}

/** Settings styled by Function with one card per entry of `looks` (`functionId → look`). */
export function functionStyleSettings(looks: Readonly<Record<string, Look>>): DesignSettings {
  const groups = Object.entries(looks).map(([value, look]) => ({ value, look }));
  return { styleBy: 'function', styles: groups.length > 0 ? { function: { groups } } : {} };
}

// ---------------------------------------------------------------------------------------------
// Number bands: round "nice" numbers and suggested starting dividers (S3, 2026-11-19).

/** Drops floating-point noise: 0.30000000000000004 → 0.3. */
const tidy = (value: number): number => Number(value.toPrecision(12));

/** A round step of about a tenth of `span`: 1, 2 or 5 × a power of ten (`span` ≤ 0 gives 1). */
export function niceStep(span: number): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const raw = span / 10;
  const power = 10 ** Math.floor(Math.log10(raw));
  const m = raw / power;
  return tidy((m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * power);
}

/** `value` rounded to the nearest multiple of `step`. */
export const roundToStep = (value: number, step: number): number => tidy(Math.round(value / step) * step);

/**
 * Round dividers that split `values` into about three bands of similar size (at the thirds),
 * each band holding at least one value. `integer`: whole-number dividers (Level). Fewer than two
 * different values: no dividers (one band for every value).
 */
export function suggestDividers(values: readonly number[], options: { readonly integer?: boolean } = {}): number[] {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length < 2) return [];
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  if (min === max) return [];
  // Round to about a fifth of the range (1, 2 or 5 × a power of ten); Level: whole storeys.
  const step = options.integer ? Math.max(1, Math.round(niceStep(2 * (max - min)))) : niceStep(2 * (max - min));
  const out: number[] = [];
  const below = (d: number) => sorted.filter((v) => v < d).length;
  for (const q of [1 / 3, 2 / 3]) {
    // The first value of the upper part, rounded.
    const at = sorted[Math.min(sorted.length - 1, Math.max(1, Math.floor(q * sorted.length)))]!;
    let d = roundToStep(at, step);
    if (d <= min) d = roundToStep(min + step, step);
    const prev = out.length > 0 ? out[out.length - 1]! : -Infinity;
    // Keep it only if the band it closes and the part above it both hold a value.
    if (d > prev && d <= max && below(d) > below(prev)) out.push(d);
  }
  return out;
}
