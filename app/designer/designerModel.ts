import type { FacadeProvider } from '@app/building';
import { distortedModules, type FacadeModuleInstance } from '@app/assets';
import {
  canonicalFacadeModule,
  sameFacadeModule,
  connectorStyleOf,
  effectiveLook,
  lookOfGroup,
  styleSetupOf,
  nodeLabel,
  ROOF_STYLES,
  windowFractionSchema,
  WINDOW_LAYOUTS,
  WALL_STYLES,
  type ConnectorStyle,
  type DesignDocumentV2,
  type EffectiveLook,
  type Look,
  type StyleGroupRef,
  type FacadeModule,
  type FacadePlacement,
  type RoofStyle,
  type WindowLayout,
  type WallStyle,
} from '@app/document/v2';
import { findNodeType, type ActiveToolkit } from '@app/extensions';
import type { DesignCommand, SpatialResolution } from '@app/spatial';
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
  /** Rooms of this type in the current design (all of them use the effective values). */
  readonly nodeCount: number;
  /** The design stores an override for a type that is neither in the project nor in the design. */
  readonly orphanOverride: boolean;
  readonly projectDefault: { readonly windowFraction: number; readonly source: ProjectDefaultSource };
  readonly effective: EffectiveLook;
  /** True when the design stores any override for this type ("Reset" is available). */
  readonly hasOverride: boolean;
  /** Readable warning (undefined / broken type, orphan override), or null. */
  readonly warning: string | null;
}

/** The function cards: the `function` setup of "Style rooms by". */
const FUNCTION = 'function';
const functionCard = (typeId: string): StyleGroupRef => ({ kind: 'value', value: typeId });
const functionSetup = (doc: Pick<DesignDocumentV2, 'settings'>) => styleSetupOf(doc.settings, FUNCTION);
/** The stored card of `typeId`, or undefined when the function has no card. */
const storedCard = (doc: Pick<DesignDocumentV2, 'settings'>, typeId: string): Look | undefined => lookOfGroup(functionSetup(doc), functionCard(typeId));
/** Effective look of a function's rooms (card → Default → `windowFraction` → built-in). */
const effectiveOf = (doc: Pick<DesignDocumentV2, 'settings'>, typeId: string, windowFraction = 0): EffectiveLook =>
  effectiveLook(functionSetup(doc), functionCard(typeId), { windowFraction });
const lookCommand = (typeId: string, patch: Extract<DesignCommand, { type: 'set-look' }>['patch']): DesignCommand => ({
  type: 'set-look',
  by: FUNCTION,
  group: functionCard(typeId),
  patch,
});

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
  if (row.orphanOverride) return 'No room uses this type and the project does not define it. Reset to remove the stored setting.';
  if (row.status.kind === 'undefined-type') {
    return `The active project does not define "${row.typeId}"; the fallback window coverage is used.`;
  }
  return null;
}

/**
 * One row per node type: the active project's registered (and broken) types in project order,
 * then types used only by the design, then types that only have a stored override. The list is
 * derived from `project` and `doc` every time, so new student-defined types appear automatically.
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
      effective: effectiveOf(doc, typeId, projectWindowFraction),
      hasOverride: storedCard(doc, typeId) !== undefined,
    };
    return { ...base, warning: warningFor(base) };
  });
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

function current(doc: DesignDocumentV2, typeId: string): Look {
  return storedCard(doc, typeId) ?? {};
}

/** Set this design's window coverage (fraction 0–1, exterior walls only) for every room of `typeId`. */
export function setWindowFractionEdit(
  doc: DesignDocumentV2,
  typeId: string,
  fraction: number,
  projectDefault: number,
): DesignerEdit {
  const checked = windowFractionSchema.safeParse(fraction);
  if (!checked.success) return { kind: 'invalid', message: 'Window coverage must be a number between 0 and 1 (0–100 %).' };
  const value = roundFraction(fraction);
  const stored = current(doc, typeId).windowFraction;
  // Unchanged: the same override, or no override and the value equals the inherited default.
  if (stored !== undefined ? stored === value : value === roundFraction(projectDefault)) return UNCHANGED;
  return {
    kind: 'command',
    command: lookCommand(typeId, { windowFraction: value }),
    label: `Set ${typeId} window coverage to ${formatPercent(value)} %`,
  };
}

/** Set this design's roof for `typeId` (applies to exposed upward faces only; Building draws it). */
export function setRoofEdit(doc: DesignDocumentV2, typeId: string, roof: string): DesignerEdit {
  if (!(ROOF_STYLES as readonly string[]).includes(roof)) {
    return { kind: 'invalid', message: `Roof must be one of: ${ROOF_STYLES.join(', ')}.` };
  }
  const stored = current(doc, typeId).roof;
  const effective = effectiveOf(doc, typeId).roof;
  if (stored !== undefined ? stored === roof : effective === roof) return UNCHANGED;
  return {
    kind: 'command',
    command: lookCommand(typeId, { roof: roof as RoofStyle }),
    label: `Set ${typeId} roof to ${roof}`,
  };
}

/** Set this design's window placement (Repeat or Stretch) for every room of `typeId`. */
export function setWindowLayoutEdit(doc: DesignDocumentV2, typeId: string, layout: string): DesignerEdit {
  if (!(WINDOW_LAYOUTS as readonly string[]).includes(layout)) {
    return { kind: 'invalid', message: `Window layout must be one of: ${WINDOW_LAYOUTS.join(', ')}.` };
  }
  const stored = current(doc, typeId).windowLayout;
  const effective = effectiveOf(doc, typeId).windowLayout;
  if (stored !== undefined ? stored === layout : effective === layout) return UNCHANGED;
  return {
    kind: 'command',
    command: lookCommand(typeId, { windowLayout: layout as WindowLayout }),
    label: `Set ${typeId} windows to ${WINDOW_LAYOUT_LABELS[layout as WindowLayout]}`,
  };
}

/** Set whether the rooms of `typeId` have exterior walls (Enclosed) or not (Open). */
export function setWallsEdit(doc: DesignDocumentV2, typeId: string, walls: string): DesignerEdit {
  if (!(WALL_STYLES as readonly string[]).includes(walls)) {
    return { kind: 'invalid', message: `Walls must be one of: ${WALL_STYLES.join(', ')}.` };
  }
  const stored = current(doc, typeId).walls;
  const effective = effectiveOf(doc, typeId).walls;
  if (stored !== undefined ? stored === walls : effective === walls) return UNCHANGED;
  return {
    kind: 'command',
    command: lookCommand(typeId, { walls: walls as WallStyle }),
    label: `Set ${typeId} walls to ${WALL_LABELS[walls as WallStyle]}`,
  };
}

/** Remove this design's overrides for `typeId` (one field or all), restoring project defaults. */
export function resetTypeEdit(
  doc: DesignDocumentV2,
  typeId: string,
  field: 'windowFraction' | 'windowLayout' | 'walls' | 'roof' | 'facade' | 'all' = 'all',
): DesignerEdit {
  const own = current(doc, typeId);
  const clearWindow = (field === 'all' || field === 'windowFraction') && own.windowFraction !== undefined;
  const clearLayout = (field === 'all' || field === 'windowLayout') && own.windowLayout !== undefined;
  const clearWalls = (field === 'all' || field === 'walls') && own.walls !== undefined;
  const clearRoof = (field === 'all' || field === 'roof') && own.roof !== undefined;
  const clearFacade = (field === 'all' || field === 'facade') && own.facade !== undefined;
  const label = `Reset ${typeId} appearance to project default`;
  const card = storedCard(doc, typeId);
  // Nothing of the card would be left: remove the card (its rooms use Default again).
  const keeps = (key: keyof Look, cleared: boolean) => own[key] !== undefined && !cleared;
  if (card !== undefined && !keeps('windowFraction', clearWindow) && !keeps('windowLayout', clearLayout) && !keeps('walls', clearWalls) && !keeps('roof', clearRoof) && !keeps('facade', clearFacade)) {
    return { kind: 'command', command: { type: 'remove-style-group', by: FUNCTION, value: typeId }, label };
  }
  if (!clearWindow && !clearLayout && !clearWalls && !clearRoof && !clearFacade) return UNCHANGED;
  return {
    kind: 'command',
    command: {
      type: 'set-look',
      by: FUNCTION,
      group: functionCard(typeId),
      patch: {
        ...(clearWindow ? { windowFraction: null } : {}),
        ...(clearLayout ? { windowLayout: null } : {}),
        ...(clearWalls ? { walls: null } : {}),
        ...(clearRoof ? { roof: null } : {}),
        ...(clearFacade ? { facade: null } : {}),
      },
    },
    label,
  };
}

// ---------------------------------------------------------------------------------------------
// Imported façades (3DM modules, 2026-11-17)

/** A function's façade in the Designer: none, or an imported module (no design-wide default). */
export type FacadeChoice = { readonly kind: 'none' } | { readonly kind: 'module'; readonly module: FacadeModule };

/** The stored choice of `typeId` (what the menu shows). */
export function facadeChoiceOf(doc: DesignDocumentV2, typeId: string): FacadeChoice {
  const own = current(doc, typeId).facade;
  return own === undefined ? { kind: 'none' } : { kind: 'module', module: own };
}

const sameModule = sameFacadeModule;

/** Set (or clear, `none`) the façade of `typeId`. */
export function setFacadeEdit(doc: DesignDocumentV2, typeId: string, choice: FacadeChoice, assetName?: string): DesignerEdit {
  const stored = facadeChoiceOf(doc, typeId);
  if (choice.kind === stored.kind && (choice.kind !== 'module' || (stored.kind === 'module' && sameModule(choice.module, stored.module)))) return UNCHANGED;
  const patch = choice.kind === 'none' ? null : canonicalFacadeModule(choice.module);
  const what = choice.kind === 'none' ? 'no imported façade' : `${assetName ?? 'an imported façade'} (${FACADE_PLACEMENT_LABELS[choice.module.placement]})`;
  return { kind: 'command', command: lookCommand(typeId, { facade: patch }), label: `Set ${typeId} to ${what}` };
}

/**
 * Façade geometry of a function (owner 2026-11-17), one control over two stored fields:
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

/** The stored mode of `typeId`. */
export function facadeModeOf(doc: DesignDocumentV2, typeId: string): FacadeMode {
  const effective = effectiveOf(doc, typeId);
  if (effective.walls === 'open') return 'open';
  return effective.facade ? 'import' : 'automatic';
}

/**
 * Switch the façade geometry in ONE command (one undo step). `import` needs the module to use
 * (`module`); leaving `import` removes the function's module, so no hidden choice is kept.
 */
export function setFacadeModeEdit(doc: DesignDocumentV2, typeId: string, mode: FacadeMode, module?: FacadeModule, assetName?: string): DesignerEdit {
  const own = current(doc, typeId);
  if (mode === 'import' && !module) return { kind: 'invalid', message: 'Choose or import a façade first.' };
  const walls: WallStyle | null = mode === 'open' ? 'open' : null;
  const facade = mode === 'import' ? canonicalFacadeModule(module!) : null;
  const sameWalls = (own.walls ?? null) === walls || (walls === null && own.walls === 'enclosed');
  if (sameWalls && sameModule(own.facade ?? null, facade)) return UNCHANGED;
  const label =
    mode === 'import' ? `Set ${typeId} façade to ${assetName ?? 'an imported façade'}` : mode === 'open' ? `Set ${typeId} to open sides` : `Set ${typeId} to automatic façade`;
  return { kind: 'command', command: lookCommand(typeId, { walls, facade }), label };
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
export function distortionMessage(instances: readonly FacadeModuleInstance[], typeId: string): string | null {
  const d = distortedModules(instances, typeId);
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
