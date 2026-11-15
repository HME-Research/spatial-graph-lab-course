import type { AttributeValue, DesignDocument, GridCoord } from '@app/document';
import {
  runAlgorithm,
  validateParameters,
  type ActiveProject,
  type AttributeSpec,
  type ExtensionDiagnostic,
  type ExtensionResult,
  type RunOutcome,
  type TransformationPreview,
} from '@app/extensions';
import type { DocumentVersion } from './documentSession';

/**
 * Pure algorithm-panel logic. Execution and validation are the Stage 3A runtime's
 * (`runAlgorithm`, `validateParameters`, `applyTransformation`); this module only converts form
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

export function listAlgorithms(project: ActiveProject | null): AlgorithmEntry[] {
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
 * Raw parameter values from drafts, for `validateParameters`/`runAlgorithm` to check. Drafts are
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

export interface AlgorithmRun {
  readonly algorithmId: string;
  readonly label: string;
  /** The exact document object the algorithm ran on. */
  readonly doc: DesignDocument;
  /** The document revision it ran at (see `DocumentSession.revision`). */
  readonly revision: number;
  readonly outcome: ExtensionResult<RunOutcome>;
}

/** Run once. Never changes `doc`; a failure is reported in `outcome`. */
export function runEntry(version: DocumentVersion, project: ActiveProject, entry: AlgorithmEntry, drafts: ParameterDrafts): AlgorithmRun {
  const { doc, revision } = version;
  return {
    algorithmId: entry.id,
    label: entry.label,
    doc,
    revision,
    outcome: runAlgorithm(doc, project, entry.id, draftsToParameters(entry, drafts)),
  };
}

/**
 * A result is stale when the document has changed since the algorithm ran: any edit, undo, redo or
 * load changes the revision, so a result never becomes current again by returning to an equivalent
 * (or the very same) document.
 */
export const isStale = (run: AlgorithmRun, current: DocumentVersion | null): boolean =>
  current === null || run.doc !== current.doc || run.revision !== current.revision;

export interface AnalysisRow {
  readonly nodeId: string;
  readonly value: AttributeValue;
  /** False when the node has since been deleted from the current document. */
  readonly exists: boolean;
}

/** Node values in the document's node order (values for unknown ids are not possible: the runtime rejects them). */
export function analysisRows(nodeValues: Readonly<Record<string, AttributeValue>>, ranOn: DesignDocument, current: DesignDocument | null): AnalysisRow[] {
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
  /** Every node added, connected or changed (sorted). */
  readonly affectedNodeIds: readonly string[];
}

/** What a validated preview changes, read from its operations and its before/after documents. */
export function describePreview(preview: TransformationPreview): PreviewSummary {
  const before = new Map(preview.before.nodes.map((n) => [n.id, n] as const));
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
    affectedNodeIds: [...affected].sort(),
  };
}

export type ApplyOutcome =
  | { readonly ok: true; readonly doc: DesignDocument }
  | { readonly ok: false; readonly reason: 'stale' | 'no-document'; readonly message: string };

/**
 * Applying a preview replaces the document with the preview's already-validated result in one
 * step. It is refused unless the current document is the exact document, at the exact revision
 * (`ranAt`), that the preview was computed from: any edit, undo, redo, load or earlier apply makes
 * a preview stale, and running the algorithm again is the new validation step.
 */
export function applyPreview(current: DocumentVersion | null, preview: TransformationPreview, ranAt: number): ApplyOutcome {
  if (current === null) return { ok: false, reason: 'no-document', message: 'No design is open.' };
  if (current.doc !== preview.before || current.revision !== ranAt) {
    return {
      ok: false,
      reason: 'stale',
      message: 'The design has changed since this preview was computed, so it was not applied. Run the algorithm again.',
    };
  }
  return { ok: true, doc: preview.after };
}

export const formatValue = (value: AttributeValue | undefined): string => (value === undefined ? '—' : JSON.stringify(value));
