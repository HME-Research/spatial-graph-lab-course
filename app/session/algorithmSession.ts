import type { AttributeValue, Attributes, GridCoord } from '@app/document';
import { relationshipLabel, type DesignDocumentV2 } from '@app/document/v2';

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
  /** Declared parameters, in declaration order (only for enabled algorithms). */
  readonly parameters: readonly (readonly [string, AttributeSpec])[];
}

export function listAlgorithms(project: ActiveToolkit | null): AlgorithmEntry[] {
  if (!project) return [];
  return project.algorithms.map((a) => {
    // Disabled definitions are unvalidated student data: read their fields defensively.
    const raw = a.definition as { label?: unknown; scope?: unknown };
    const enabled = a.status.ok;
    const ids = new Set(a.status.ok ? [] : a.status.diagnosticIds);
    return {
      id: a.id,
      label: typeof raw.label === 'string' && raw.label !== '' ? raw.label : a.id,
      scope: raw.scope === 'graph' || raw.scope === 'spatial' ? raw.scope : 'unknown',
      file: a.file,
      enabled,
      problems: project.diagnostics.filter((d) => ids.has(d.id)).map((d) => d.message),
      parameters: enabled ? Object.entries(a.definition.parameters ?? {}) : [],
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

export interface AnalysisRow {
  readonly nodeId: string;
  readonly value: AttributeValue;
  /** False when the node has since been deleted from the current document. */
  readonly exists: boolean;
}

/** Node values in the document's node order (values for unknown ids are not possible: the runtime rejects them). */
type HasNodes = { readonly nodes: readonly { readonly id: string }[] };

export function analysisRows(nodeValues: Readonly<Record<string, AttributeValue>>, ranOn: HasNodes, current: HasNodes | null): AnalysisRow[] {
  const present = new Set(current?.nodes.map((n) => n.id) ?? []);
  return ranOn.nodes
    .filter((n) => Object.prototype.hasOwnProperty.call(nodeValues, n.id))
    .map((n) => ({ nodeId: n.id, value: nodeValues[n.id]!, exists: present.has(n.id) }));
}

export interface PreviewSummary {
  readonly addedNodes: readonly { readonly id: string; readonly typeId: string; readonly grid: GridCoord }[];
  readonly addedEdges: readonly { readonly id: string; readonly source: string; readonly target: string; readonly kind: string }[];
  readonly attributeChanges: readonly {
    readonly nodeId: string;
    readonly key: string;
    /** undefined: absent before. */
    readonly from: AttributeValue | undefined;
    readonly to: AttributeValue;
  }[];
  /** Edge attribute values the transformation sets (schema v2 only). */
  readonly edgeAttributeChanges: readonly {
    readonly edgeId: string;
    readonly key: string;
    readonly from: AttributeValue | undefined;
    readonly to: AttributeValue;
  }[];
  /** Every node added, connected or changed (sorted). */
  readonly affectedNodeIds: readonly string[];
}

/** What a validated preview changes, read from its operations and its before/after documents. */
export function describePreview(
  preview: Pick<TransformationPreviewV2, 'operations'> & {
    readonly before: {
      readonly nodes: readonly { readonly id: string; readonly attributes: Attributes }[];
      readonly edges?: readonly { readonly id: string; readonly source: string; readonly target: string; readonly attributes: Attributes }[];
    };
  },
): PreviewSummary {
  const before = new Map(preview.before.nodes.map((n) => [n.id, n] as const));
  const beforeEdges = new Map((preview.before.edges ?? []).map((e) => [e.id, e] as const));
  const edgeChanges = new Map<string, PreviewSummary['edgeAttributeChanges'][number]>();
  const addedNodes: PreviewSummary['addedNodes'][number][] = [];
  const addedEdges: PreviewSummary['addedEdges'][number][] = [];
  const changes = new Map<string, PreviewSummary['attributeChanges'][number]>();
  const affected = new Set<string>();
  for (const op of preview.operations) {
    if (op.op === 'add-node') {
      addedNodes.push({ id: op.id, typeId: op.typeId, grid: [op.grid[0], op.grid[1], op.grid[2]] });
      affected.add(op.id);
    } else if (op.op === 'add-edge') {
      addedEdges.push({ id: op.id, source: op.source, target: op.target, kind: op.kind });
      affected.add(op.source).add(op.target);
    } else if (op.op === 'set-edge-attribute') {
      const edge = beforeEdges.get(op.edgeId);
      if (!edge) continue; // attribute of an edge added by this transformation
      affected.add(edge.source).add(edge.target);
      const stored = edge.attributes;
      const from = Object.prototype.hasOwnProperty.call(stored, op.key) ? stored[op.key] : undefined;
      edgeChanges.set(`${op.edgeId}\u0000${op.key}`, { edgeId: op.edgeId, key: op.key, from, to: op.value });
    } else {
      affected.add(op.nodeId);
      if (!before.has(op.nodeId)) continue; // attribute of a node added by this transformation
      const key = `${op.nodeId}\u0000${op.key}`;
      const stored = before.get(op.nodeId)!.attributes;
      const from = Object.prototype.hasOwnProperty.call(stored, op.key) ? stored[op.key] : undefined;
      changes.set(key, { nodeId: op.nodeId, key: op.key, from, to: op.value });
    }
  }
  return {
    addedNodes,
    addedEdges,
    // Only real changes (an operation may write the value already stored).
    attributeChanges: [...changes.values()].filter((c) => c.from !== c.to),
    edgeAttributeChanges: [...edgeChanges.values()].filter((c) => c.from !== c.to),
    affectedNodeIds: [...affected].sort(),
  };
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
