import { type Attributes, type AttributeValue, type DesignDocumentV2, type GridCoord, relationshipLabel } from '@app/document';

export { relationshipLabel };
import {
  runAlgorithmV2,
  type RunOutcomeV2,
  type TransformationPreviewV2,
  validateParameters,
  type ActiveToolkit,
  type AttributeSpec,
  type ExtensionDiagnostic,
  type ExtensionResult,
  type ProjectAttributeSchema,
} from '@app/extensions';
import type { AnalysisInput } from '@app/ui/analysisSections';
import type { SpatialResolution } from '@app/spatial';
import type { DocumentVersion } from './documentSession';

/**
 * Pure algorithm-panel logic. Execution and validation are the Stage 3A runtime's
 * (`runAlgorithmV2`, `validateParameters`, `applyTransformationV2`); this module only converts form
 * drafts, describes results and decides whether a preview may still be applied.
 */

export interface AlgorithmEntry {
  readonly id: string;
  /** The student's label, or the id when the definition is too broken to have one. */
  readonly label: string;
  readonly scope: 'graph' | 'spatial' | 'unknown';
  readonly file: string;
  readonly enabled: boolean;
  /** Why it is disabled (diagnostic messages); empty when enabled. */
  readonly problems: readonly string[];
  /** Declared parameters of a transformation, in declaration order (only for enabled spatial algorithms). */
  readonly parameters: readonly (readonly [string, AttributeSpec])[];
  /**
   * Declared inputs of a graph analysis (P4). For a disabled analysis, the inputs as far as they can
   * be read (else none), so it can still be listed in a section with its problems.
   */
  readonly inputs: readonly AnalysisInput[];
}

const INPUT_KINDS: readonly unknown[] = ['node', 'edge', 'number'];

/** Inputs of an unvalidated definition, read defensively (only well-formed entries). */
function readInputs(raw: unknown): AnalysisInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((i: unknown) => {
    const r = i as { kind?: unknown; label?: unknown } | null;
    return r && INPUT_KINDS.includes(r.kind) && typeof r.label === 'string' ? [{ kind: r.kind, label: r.label } as AnalysisInput] : [];
  });
}

export function listAlgorithms(project: ActiveToolkit | null): AlgorithmEntry[] {
  if (!project) return [];
  return project.algorithms.map((a) => {
    // Disabled definitions are unvalidated student data: read their fields defensively.
    const raw = a.definition as { label?: unknown; scope?: unknown; inputs?: unknown };
    const enabled = a.status.ok;
    const ids = new Set(a.status.ok ? [] : a.status.diagnosticIds);
    return {
      id: a.id,
      label: typeof raw.label === 'string' && raw.label !== '' ? raw.label : a.id,
      scope: raw.scope === 'graph' || raw.scope === 'spatial' ? raw.scope : 'unknown',
      file: a.file,
      enabled,
      problems: project.diagnostics.filter((d) => ids.has(d.id)).map((d) => d.message),
      parameters: enabled && a.definition.scope === 'spatial' ? Object.entries(a.definition.parameters ?? {}) : [],
      inputs: enabled && a.definition.scope === 'graph' ? a.definition.inputs : raw.scope === 'graph' ? readInputs(raw.inputs) : [],
    };
  });
}

/** Form drafts for parameters: name → text. An empty draft means "use the default". */
export type ParameterDrafts = Readonly<Record<string, string>>;

/**
 * Raw parameter values from drafts, for `validateParameters`/`runAlgorithmV2` to check. Drafts are
 * converted by kind only (number text → number, "true"/"false" → boolean); text that is not a
 * number is passed through unchanged so that the runtime's message shows what was typed.
 */
export function draftsToParameters(entry: AlgorithmEntry, drafts: ParameterDrafts): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, spec] of entry.parameters) {
    const draft = Object.prototype.hasOwnProperty.call(drafts, key) ? drafts[key]! : '';
    if (draft === '' || (spec.kind !== 'text' && draft.trim() === '')) continue;
    if (spec.kind === 'number') {
      const n = Number(draft.trim());
      out[key] = Number.isNaN(n) ? draft : n;
    } else if (spec.kind === 'boolean') {
      out[key] = draft === 'true' ? true : draft === 'false' ? false : draft;
    } else out[key] = draft;
  }
  return out;
}

/** Parameter problems for the current drafts (the runtime's own validation). */
export function parameterProblems(entry: AlgorithmEntry, drafts: ParameterDrafts): readonly ExtensionDiagnostic[] {
  const specs = Object.fromEntries(entry.parameters);
  const result = validateParameters(specs, draftsToParameters(entry, drafts), entry.id);
  return result.ok ? [] : result.issues;
}

export interface AlgorithmRun<D extends object = DesignDocumentV2, O = RunOutcomeV2> {
  readonly algorithmId: string;
  readonly label: string;
  /** The exact document object the algorithm ran on. */
  readonly doc: D;
  /** The document revision it ran at (see `DocumentSession.revision`). */
  readonly revision: number;
  /** The project attribute schema revision it ran with (absent: not tracked). */
  readonly attributesRevision?: number;
  readonly outcome: ExtensionResult<O>;
}

/** The project attribute schema in use and its revision (app/session/projectAttributeStore.ts). */
export interface AttributesVersion {
  readonly schema: ProjectAttributeSchema;
  readonly revision: number;
}

/** A run against the stored schema-v2 document (the app after Gate 1). */
export type AlgorithmRunV2 = AlgorithmRun<DesignDocumentV2, RunOutcomeV2>;

/**
 * The host's resolution of a document (the design port's `spatial`: resolved WITH the scenario's
 * face preferences). Used only when `doc` is the very document being run.
 */
export interface HostResolution {
  readonly doc: DesignDocumentV2;
  readonly spatial: SpatialResolution;
}

/**
 * Run once against the schema-v2 document (`runAlgorithmV2`). Never changes `doc`. With
 * `resolution` for this exact document, spatial algorithms (and `ctx.metrics`) see the same
 * preference-aware resolution the views show; otherwise the runtime resolves without preferences.
 */
export function runEntryV2(
  version: DocumentVersion<DesignDocumentV2>,
  project: ActiveToolkit,
  entry: AlgorithmEntry,
  drafts: ParameterDrafts,
  attributes?: AttributesVersion,
  resolution?: HostResolution,
  /** The picked inputs of a graph analysis (ids and numbers, in declaration order). */
  inputs?: readonly number[],
): AlgorithmRunV2 {
  const { doc, revision } = version;
  const spatial = resolution && resolution.doc === doc ? resolution.spatial : undefined;
  return {
    algorithmId: entry.id,
    label: entry.label,
    doc,
    revision,
    ...(attributes && { attributesRevision: attributes.revision }),
    outcome: runAlgorithmV2(doc, project, entry.id, draftsToParameters(entry, drafts), {
      ...(attributes && { attributes: attributes.schema }),
      ...(spatial && { spatial }),
      ...(inputs && { inputs }),
    }),
  };
}

/**
 * A result is stale when the document has changed since the algorithm ran: any edit, undo, redo or
 * load changes the revision, so a result never becomes current again by returning to an equivalent
 * (or the very same) document.
 */
export const isStale = (
  run: Pick<AlgorithmRun<object, unknown>, 'doc' | 'revision' | 'attributesRevision'>,
  current: DocumentVersion<object> | null,
  attributesRevision?: number,
): boolean =>
  current === null ||
  run.doc !== current.doc ||
  run.revision !== current.revision ||
  // A project attribute change (fields, defaults) can change what the algorithm read.
  (attributesRevision !== undefined && run.attributesRevision !== undefined && run.attributesRevision !== attributesRevision);

export interface PreviewSummary {
  /** New rooms with the ids the app gave them. */
  readonly addedNodes: readonly { readonly id: number; readonly typeId: string; readonly grid: GridCoord }[];
  readonly addedEdges: readonly { readonly id: number; readonly source: number; readonly target: number; readonly kind: string }[];
  readonly attributeChanges: readonly {
    readonly nodeId: number;
    readonly key: string;
    /** undefined: absent before. */
    readonly from: AttributeValue | undefined;
    readonly to: AttributeValue;
  }[];
  /** Edge attribute values the transformation changes. */
  readonly edgeAttributeChanges: readonly {
    readonly edgeId: number;
    readonly key: string;
    readonly from: AttributeValue | undefined;
    readonly to: AttributeValue;
  }[];
  /** Every node added, connected or changed (ascending). */
  readonly affectedNodeIds: readonly number[];
}

type SummaryNode = { readonly id: number; readonly typeId: string; readonly grid: GridCoord; readonly attributes: Attributes };
type SummaryEdge = { readonly id: number; readonly source: number; readonly target: number; readonly kind: string; readonly attributes: Attributes };

/**
 * What a validated preview changes, read from its before / after documents (P4: new nodes and edges
 * are those whose id the app gave during the run, so the summary names the ids they really got).
 */
export function describePreview(preview: {
  readonly before: { readonly nodes: readonly SummaryNode[]; readonly edges: readonly SummaryEdge[] };
  readonly after: { readonly nodes: readonly SummaryNode[]; readonly edges: readonly SummaryEdge[] };
}): PreviewSummary {
  const beforeNodes = new Map(preview.before.nodes.map((n) => [n.id, n] as const));
  const beforeEdges = new Map(preview.before.edges.map((e) => [e.id, e] as const));
  const affected = new Set<number>();
  const changed = (from: Attributes, to: Attributes) =>
    Object.keys(to).filter((key) => !Object.prototype.hasOwnProperty.call(from, key) || from[key] !== to[key]);
  const addedNodes: PreviewSummary['addedNodes'][number][] = [];
  const attributeChanges: PreviewSummary['attributeChanges'][number][] = [];
  for (const n of preview.after.nodes) {
    const old = beforeNodes.get(n.id);
    if (!old) {
      addedNodes.push({ id: n.id, typeId: n.typeId, grid: [n.grid[0], n.grid[1], n.grid[2]] });
      affected.add(n.id);
      continue;
    }
    for (const key of changed(old.attributes, n.attributes)) {
      attributeChanges.push({ nodeId: n.id, key, from: Object.prototype.hasOwnProperty.call(old.attributes, key) ? old.attributes[key] : undefined, to: n.attributes[key]! });
      affected.add(n.id);
    }
  }
  const addedEdges: PreviewSummary['addedEdges'][number][] = [];
  const edgeAttributeChanges: PreviewSummary['edgeAttributeChanges'][number][] = [];
  for (const e of preview.after.edges) {
    const old = beforeEdges.get(e.id);
    if (!old) {
      addedEdges.push({ id: e.id, source: e.source, target: e.target, kind: e.kind });
      affected.add(e.source).add(e.target);
      continue;
    }
    for (const key of changed(old.attributes, e.attributes)) {
      edgeAttributeChanges.push({ edgeId: e.id, key, from: Object.prototype.hasOwnProperty.call(old.attributes, key) ? old.attributes[key] : undefined, to: e.attributes[key]! });
      affected.add(e.source).add(e.target);
    }
  }
  return { addedNodes, addedEdges, attributeChanges, edgeAttributeChanges, affectedNodeIds: [...affected].sort((a, b) => a - b) };
}

export type ApplyOutcome<D extends object = DesignDocumentV2> =
  | { readonly ok: true; readonly doc: D }
  | { readonly ok: false; readonly reason: 'stale' | 'no-document' | 'needs-confirmation'; readonly message: string };


export const formatValue = (value: AttributeValue | undefined): string => (value === undefined ? '—' : JSON.stringify(value));

/**
 * Applying a preview replaces the document with the preview's already-validated result in one
 * step. It is refused unless the current document is the exact document, at the exact revision
 * (`ranAt`), that the preview was computed from: any edit, undo, redo, load or earlier apply makes
 * a preview stale, and running the algorithm again is the new validation step. In addition, a
 * preview whose new rooms take cells of generated connectors (`displacedRoutes`) is applied only
 * after the user chose "Move anyway and recalculate" (`confirmRouteDisplacement`); never silently.
 */
export function applyPreviewV2(
  current: DocumentVersion<DesignDocumentV2> | null,
  preview: TransformationPreviewV2,
  ranAt: number,
  options: { readonly confirmRouteDisplacement?: boolean } = {},
): ApplyOutcome<DesignDocumentV2> {
  if (current === null) return { ok: false, reason: 'no-document', message: 'No design is open.' };
  if (current.doc !== preview.before || current.revision !== ranAt) {
    return {
      ok: false,
      reason: 'stale',
      message: 'The design has changed since this preview was computed, so it was not applied. Run the algorithm again.',
    };
  }
  if (preview.displacedRoutes.length > 0 && options.confirmRouteDisplacement !== true) {
    return {
      ok: false,
      reason: 'needs-confirmation',
      message: `New rooms would take the corridor cells of ${preview.displacedRoutes.map((id) => relationshipLabel(current.doc, id)).join(', ')}. Confirm "Move anyway and recalculate" to apply.`,
    };
  }
  return { ok: true, doc: preview.after };
}
