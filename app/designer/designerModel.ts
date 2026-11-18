import type { FacadeProvider } from '@app/building';
import { distortedModules, type FacadeModuleInstance } from '@app/assets';
import {
  canonicalFacadeModule,
  sameFacadeModule,
  connectorStyleOf,
  DEFAULT_GROUP,
  effectiveLook,
  lookOfGroup,
  nodeLooks,
  sameGroup,
  styleSetupOf,
  styleValueKey,
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
  type StyleValues,
  type FacadeModule,
  type FacadePlacement,
  type RoofStyle,
  type WindowLayout,
  type WallStyle,
} from '@app/document/v2';
import { findNodeType, type ActiveToolkit } from '@app/extensions';
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

/** Readable names of the attributes rooms can be styled by (S2: Function only). */
export const STYLE_BY_LABELS: Readonly<Record<string, string>> = { function: 'Function' };

export interface DesignerCardRow {
  /** Stable key for element ids and remembered open state ("default", "v:gallery", "b:0"). */
  readonly key: string;
  readonly target: CardTarget;
  /** Function cards: the type id (swatch colour, façade fit warning); otherwise null. */
  readonly typeId: string | null;
  /** Card title, e.g. "Default", "Gallery (gallery)". */
  readonly name: string;
  /** The rooms this card styles now (each room is in exactly one card). */
  readonly nodeIds: readonly string[];
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
  readonly defaultCard: DesignerCardRow;
  readonly cards: readonly DesignerCardRow[];
  /** Functions without a card, for "+ Style another function" (styling by Function only). */
  readonly addable: readonly { readonly value: string; readonly label: string; readonly nodeCount: number }[];
}

const cardKey = (group: StyleGroupRef): string =>
  group.kind === 'default' ? 'default' : group.kind === 'band' ? `b:${group.index}` : `v:${String(group.value)}`;

/** Example window coverage shown when the rooms of a card have different functions. */
const MIXED_BASE = 0.25;

/** The single toolkit window coverage of these rooms, or null when their functions' defaults differ. */
function sharedBase(doc: DesignDocumentV2, nodeIds: readonly string[], facade: FacadeProvider): number | null {
  const ids = new Set(nodeIds);
  const values = new Set(doc.nodes.filter((n) => ids.has(n.id)).map((n) => facade(n.typeId).windowFraction));
  return values.size === 1 ? [...values][0]! : null;
}

/** "Under 50", "50 – 100", "100 or more". */
export function bandName(dividers: readonly number[], index: number): string {
  const lo = dividers[index - 1];
  const hi = dividers[index];
  if (lo === undefined) return hi === undefined ? 'All values' : `Under ${hi}`;
  if (hi === undefined) return `${lo} or more`;
  return `${lo} – ${hi}`;
}

/**
 * The Designer cards of `doc`: Default plus one card per stored value / band of the active
 * "Style rooms by" attribute, each with the rooms it styles now. `values` supplies attribute /
 * measured values (not needed for Function and Level).
 */
export function designerCards(doc: DesignDocumentV2, project: ActiveToolkit | null, facade: FacadeProvider, values?: StyleValues): DesignerCards {
  const by = doc.settings.styleBy;
  const setup = styleSetupOf(doc.settings, by);
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
      hasOverride: stored !== undefined && (group.kind !== 'default' || Object.keys(stored).length > 0),
      removable: group.kind === 'value',
      warning,
    };
  };

  const defaultCard = row(DEFAULT_GROUP, 'Default', null, null);
  const cards: DesignerCardRow[] = [];
  if (setup.dividers && setup.bands) {
    setup.bands.forEach((_, index) => cards.push(row({ kind: 'band', index }, bandName(setup.dividers!, index), null, null)));
  }
  for (const g of setup.groups ?? []) {
    const group: StyleGroupRef = { kind: 'value', value: g.value };
    if (by === FUNCTION) {
      const typeId = String(g.value);
      const t = types.find((r) => r.typeId === typeId);
      cards.push(row(group, t?.name ?? typeId, typeId, t?.warning ?? null));
    } else {
      cards.push(row(group, String(g.value), null, null));
    }
  }
  const carded = new Set((setup.groups ?? []).map((g) => styleValueKey(g.value)));
  const addable = types.filter((t) => !carded.has(styleValueKey(t.typeId))).map((t) => ({ value: t.typeId, label: t.name, nodeCount: t.nodeCount }));
  return { by, byLabel: STYLE_BY_LABELS[by] ?? by, defaultCard, cards, addable };
}

/** Add a card for `value`: an empty card, so its rooms keep their look until something is changed. */
export function addCardEdit(doc: DesignDocumentV2, by: StyleBy, value: string, name = value): DesignerEdit {
  if (lookOfGroup(styleSetupOf(doc.settings, by), { kind: 'value', value }) !== undefined) return UNCHANGED;
  return { kind: 'command', command: { type: 'set-look', by, group: { kind: 'value', value }, patch: {} }, label: `Add a Designer card for ${name}` };
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
export function distortionMessage(instances: readonly FacadeModuleInstance[], owner: string | ReadonlySet<string>): string | null {
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
  readonly edgeId: string;
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
  const labelOf = (id: string) => {
    const node = doc.nodes.find((n) => n.id === id);
    return node ? nodeLabel(node) : id;
  };
  return {
    edgeId: edge.id,
    label: `${labelOf(edge.source)} → ${labelOf(edge.target)}`,
    style: connectorStyleOf(edge),
    styleIsDefault: edge.connectorStyle === undefined,
    status: spatial?.byEdge.get(edge.id)?.status ?? null,
  };
}
