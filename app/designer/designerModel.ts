import type { FacadeProvider } from '@app/building';
import {
  connectorStyleOf,
  effectiveTypeAppearance,
  nodeLabel,
  ROOF_STYLES,
  windowFractionSchema,
  type ConnectorStyle,
  type DesignDocumentV2,
  type EffectiveTypeAppearance,
  type RoofStyle,
} from '@app/document/v2';
import { findNodeType, type ActiveProject } from '@app/extensions';
import type { DesignCommand, SpatialResolution } from '@app/spatial';
import { nodeTypeStatus, typeDisplayName, type NodeTypeStatus } from '@app/views/project';
import type { Selection } from '@core/viewer/selection';

/**
 * Designer model (06-designer): pure helpers behind the Designer panel. No React here.
 *
 * - One set of appearance rules per node type PER DESIGN, stored in the frozen v2 shape
 *   `settings.typeAppearance` and changed only through the frozen `set-type-appearance` command.
 * - Defaults are resolved on read with the frozen `effectiveTypeAppearance`; nothing is
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
  readonly effective: EffectiveTypeAppearance;
  /** True when the design stores any override for this type ("Reset" is available). */
  readonly hasOverride: boolean;
  /** Readable warning (undefined / broken type, orphan override), or null. */
  readonly warning: string | null;
}

const hasOwn = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);

function projectDefaultSource(project: ActiveProject | null, status: NodeTypeStatus, typeId: string): ProjectDefaultSource {
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
  project: ActiveProject | null,
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
  Object.keys(doc.settings.typeAppearance).sort().forEach(add);

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
      effective: effectiveTypeAppearance(doc, typeId, { windowFraction: projectWindowFraction }),
      hasOverride: hasOwn(doc.settings.typeAppearance, typeId),
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

function current(doc: DesignDocumentV2, typeId: string) {
  return hasOwn(doc.settings.typeAppearance, typeId) ? doc.settings.typeAppearance[typeId]! : {};
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
    command: { type: 'set-type-appearance', typeId, patch: { windowFraction: value } },
    label: `Set ${typeId} window coverage to ${formatPercent(value)} %`,
  };
}

/** Set this design's roof for `typeId` (applies to exposed upward faces only; Building draws it). */
export function setRoofEdit(doc: DesignDocumentV2, typeId: string, roof: string): DesignerEdit {
  if (!(ROOF_STYLES as readonly string[]).includes(roof)) {
    return { kind: 'invalid', message: `Roof must be one of: ${ROOF_STYLES.join(', ')}.` };
  }
  const stored = current(doc, typeId).roof;
  const effective = effectiveTypeAppearance(doc, typeId, { windowFraction: 0 }).roof;
  if (stored !== undefined ? stored === roof : effective === roof) return UNCHANGED;
  return {
    kind: 'command',
    command: { type: 'set-type-appearance', typeId, patch: { roof: roof as RoofStyle } },
    label: `Set ${typeId} roof to ${roof}`,
  };
}

/** Remove this design's overrides for `typeId` (one field or all), restoring project defaults. */
export function resetTypeEdit(
  doc: DesignDocumentV2,
  typeId: string,
  field: 'windowFraction' | 'roof' | 'all' = 'all',
): DesignerEdit {
  const own = current(doc, typeId);
  const clearWindow = (field === 'all' || field === 'windowFraction') && own.windowFraction !== undefined;
  const clearRoof = (field === 'all' || field === 'roof') && own.roof !== undefined;
  if (!clearWindow && !clearRoof) return UNCHANGED;
  return {
    kind: 'command',
    command: {
      type: 'set-type-appearance',
      typeId,
      patch: { ...(clearWindow ? { windowFraction: null } : {}), ...(clearRoof ? { roof: null } : {}) },
    },
    label: `Reset ${typeId} appearance to project default`,
  };
}

/**
 * Integration adapter: a façade provider that applies this design's per-type overrides on top of
 * the project's provider. Building/Architecture can use it instead of `ProjectViewContext.facade`
 * so every room of a type gets the effective window coverage.
 */
export function designFacadeProvider(doc: Pick<DesignDocumentV2, 'settings'>, project: FacadeProvider): FacadeProvider {
  const cache = new Map<string, { windowFraction: number }>();
  return (typeId) => {
    let spec = cache.get(typeId);
    if (!spec) {
      spec = Object.freeze({ windowFraction: effectiveTypeAppearance(doc, typeId, project(typeId)).windowFraction });
      cache.set(typeId, spec);
    }
    return spec;
  };
}

/** Integration adapter: effective roof of a type in this design (`flat` unless overridden). */
export const designRoofOf = (doc: Pick<DesignDocumentV2, 'settings'>, typeId: string): RoofStyle =>
  effectiveTypeAppearance(doc, typeId, { windowFraction: 0 }).roof;

export const ROOF_LABELS: Readonly<Record<RoofStyle, string>> = {
  flat: 'Flat',
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
