import { applyGraphCommand, type DesignDocument, type GraphCommand, type GraphIssue } from '@app/document';
import { createHistory, record, redo, undo, type History } from './history';

/**
 * The open document with its undo/redo history and unsaved-change baseline. Pure: every function
 * returns a new session (or the same object when nothing changes) and never mutates its input.
 *
 * Only the document is in history. Selection, cameras, panel layout and algorithm results are not.
 */
export interface DocumentSession {
  readonly history: History<DesignDocument>;
  /** Where the document was loaded from (shown in the project bar). */
  readonly source: string;
  /**
   * Increases on every change of the shown document: an edit, undo, redo or opening a document.
   * Algorithm results record it, so a result is stale after any of these, even when undo/redo
   * returns to an equivalent (or the very same) document object.
   */
  readonly revision: number;
  /** `documentSignature` of the document last loaded or exported: the clean state. */
  readonly baseline: string;
}

/** The document and the revision it is shown at; what an algorithm result is bound to. */
export interface DocumentVersion {
  readonly doc: DesignDocument;
  readonly revision: number;
}

// ---------------------------------------------------------------------------------------------
// Clean-state signature

const signatures = new WeakMap<DesignDocument, string>();

/** Plain data with every object's keys sorted; array order is kept (it is part of the document). */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] !== undefined) out[key] = canonical(source[key]);
    }
    return out;
  }
  return value;
}

/**
 * Deterministic content signature: canonical JSON with sorted object keys. Two documents have the
 * same signature exactly when they have the same content (attribute or position key order does not
 * matter; node and edge order does, because it is exported). Cached per document object.
 */
export function documentSignature(doc: DesignDocument): string {
  let signature = signatures.get(doc);
  if (signature === undefined) {
    signature = JSON.stringify(canonical(doc));
    signatures.set(doc, signature);
  }
  return signature;
}

export const sameDocument = (a: DesignDocument, b: DesignDocument): boolean => a === b || documentSignature(a) === documentSignature(b);

// ---------------------------------------------------------------------------------------------
// Transitions

/** A freshly opened document: empty history, clean. `previous` keeps revisions increasing. */
export function openDocument(doc: DesignDocument, source: string, previous: DocumentSession | null): DocumentSession {
  return { history: createHistory(doc), source, revision: (previous?.revision ?? 0) + 1, baseline: documentSignature(doc) };
}

export const currentDocument = (session: DocumentSession): DesignDocument => session.history.present;

export const versionOf = (session: DocumentSession): DocumentVersion => ({ doc: session.history.present, revision: session.revision });

/** Record an already-validated new document as one history step. A no-op returns the same session. */
export function commitDocument(session: DocumentSession, next: DesignDocument, label: string | null): DocumentSession {
  const history = record(session.history, next, label, sameDocument);
  return history === session.history ? session : { ...session, history, revision: session.revision + 1 };
}

export type SessionCommandOutcome =
  | { readonly ok: true; readonly session: DocumentSession; readonly changed: boolean }
  | { readonly ok: false; readonly issues: readonly GraphIssue[] };

/** Apply one graph command and record it. Failed commands leave the session (and history) untouched. */
export function applyCommand(session: DocumentSession, command: GraphCommand): SessionCommandOutcome {
  const result = applyGraphCommand(currentDocument(session), command);
  if (!result.ok) return { ok: false, issues: result.issues };
  const next = commitDocument(session, result.value, commandLabel(command));
  return { ok: true, session: next, changed: next !== session };
}

export function undoDocument(session: DocumentSession): DocumentSession {
  const history = undo(session.history);
  return history === session.history ? session : { ...session, history, revision: session.revision + 1 };
}

export function redoDocument(session: DocumentSession): DocumentSession {
  const history = redo(session.history);
  return history === session.history ? session : { ...session, history, revision: session.revision + 1 };
}

/** After a successful export of `exported`: it becomes the clean state. History is kept. */
export function markExported(session: DocumentSession, exported: DesignDocument): DocumentSession {
  const baseline = documentSignature(exported);
  return baseline === session.baseline ? session : { ...session, baseline };
}

/** Unsaved changes: the current content differs from the last loaded or exported content. */
export const isModified = (session: DocumentSession | null): boolean =>
  session !== null && documentSignature(currentDocument(session)) !== session.baseline;

// ---------------------------------------------------------------------------------------------
// Labels

/** Short human-readable label for a command, shown in the Undo/Redo tooltips. */
export function commandLabel(command: GraphCommand): string {
  switch (command.type) {
    case 'add-node':
      return `Add node ${command.node.id}`;
    case 'remove-node':
      return `Delete node ${command.nodeId}`;
    case 'move-node':
      return `Move ${command.nodeId} to [${command.grid.join(', ')}]`;
    case 'set-node-type':
      return `Change the type of ${command.nodeId}`;
    case 'set-node-attributes':
      return `Edit the attributes of ${command.nodeId}`;
    case 'set-diagram-position':
      return `Move ${command.nodeId} in the diagram`;
    case 'add-edge':
      return `Add ${command.edge.kind} ${command.edge.id}`;
    case 'remove-edge':
      return `Delete edge ${command.edgeId}`;
    case 'change-edge-kind':
      return `Change ${command.edgeId} to ${command.kind}`;
    default: {
      const unreachable: never = command;
      throw new Error(`unknown graph command ${JSON.stringify(unreachable)}`);
    }
  }
}
