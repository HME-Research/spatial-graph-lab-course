import { type DesignDocumentV2, type GraphIssue, nodeLabel, relationshipLabel } from '@app/document';
import { applyDesignCommand, type CorridorPatch, type DesignCommand } from '@app/spatial';
import { createHistory, record, redo, undo, type History } from './history';

/**
 * The open document with its undo/redo history and unsaved-change baseline. Pure: every function
 * returns a new session (or the same object when nothing changes) and never mutates its input.
 *
 * Only the document is in history. Selection, cameras, panel layout and algorithm results are not.
 */
export interface DocumentSession<D extends object = DesignDocumentV2> {
  readonly history: History<D>;
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
export interface DocumentVersion<D extends object = DesignDocumentV2> {
  readonly doc: D;
  readonly revision: number;
}

// ---------------------------------------------------------------------------------------------
// Clean-state signature

const signatures = new WeakMap<object, string>();

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
export function documentSignature(doc: object): string {
  let signature = signatures.get(doc);
  if (signature === undefined) {
    signature = JSON.stringify(canonical(doc));
    signatures.set(doc, signature);
  }
  return signature;
}

export const sameDocument = (a: object, b: object): boolean => a === b || documentSignature(a) === documentSignature(b);

// ---------------------------------------------------------------------------------------------
// Transitions

/** A freshly opened document: empty history, clean. `previous` keeps revisions increasing. */
export function openDocument<D extends object>(doc: D, source: string, previous: DocumentSession<object> | null): DocumentSession<D> {
  return { history: createHistory(doc), source, revision: (previous?.revision ?? 0) + 1, baseline: documentSignature(doc) };
}

export const currentDocument = <D extends object>(session: DocumentSession<D>): D => session.history.present;

export const versionOf = <D extends object>(session: DocumentSession<D>): DocumentVersion<D> => ({ doc: session.history.present, revision: session.revision });

/** Record an already-validated new document as one history step. A no-op returns the same session. */
export function commitDocument<D extends object>(session: DocumentSession<D>, next: D, label: string | null): DocumentSession<D> {
  const history = record(session.history, next, label, sameDocument);
  return history === session.history ? session : { ...session, history, revision: session.revision + 1 };
}

export type SessionCommandOutcome<D extends object = DesignDocumentV2> =
  | { readonly ok: true; readonly session: DocumentSession<D>; readonly changed: boolean }
  | { readonly ok: false; readonly issues: readonly GraphIssue[] };

/**
 * Apply one schema-v2 command (`applyDesignCommand`, which validates the result) and record it as
 * one history step labelled for the Undo/Redo tooltips. A failed command (including an
 * unconfirmed route displacement) leaves the session and history untouched; a no-op records nothing.
 */
export function applyDesignCommandToSession(
  session: DocumentSession<DesignDocumentV2>,
  command: DesignCommand,
): SessionCommandOutcome<DesignDocumentV2> {
  const before = currentDocument(session);
  const result = applyDesignCommand(before, command);
  if (!result.ok) return { ok: false, issues: result.issues };
  const next = commitDocument(session, result.value, designCommandLabel(command, before));
  return { ok: true, session: next, changed: next !== session };
}

export function undoDocument<D extends object>(session: DocumentSession<D>): DocumentSession<D> {
  const history = undo(session.history);
  return history === session.history ? session : { ...session, history, revision: session.revision + 1 };
}

export function redoDocument<D extends object>(session: DocumentSession<D>): DocumentSession<D> {
  const history = redo(session.history);
  return history === session.history ? session : { ...session, history, revision: session.revision + 1 };
}

/** After a successful export of `exported`: it becomes the clean state. History is kept. */
export function markExported<D extends object>(session: DocumentSession<D>, exported: D): DocumentSession<D> {
  const baseline = documentSignature(exported);
  return baseline === session.baseline ? session : { ...session, baseline };
}

/** Unsaved changes: the current content differs from the last loaded or exported content. */
export const isModified = (session: DocumentSession<object> | null): boolean =>
  session !== null && documentSignature(currentDocument(session)) !== session.baseline;

// ---------------------------------------------------------------------------------------------
// Labels

const CORRIDOR_VALUE_WORDS: Readonly<Record<string, string>> = { enclosed: 'Enclosed', open: 'Open', flat: 'Flat', pergola: 'Pergola', none: 'None' };

/**
 * Undo label of a corridor change: of the Corridors card (`connection` absent) or of one
 * relationship's own corridor ("connection 3 → 7").
 */
function corridorPatchLabel(patch: CorridorPatch, connection?: string): string {
  const keys = (['walls', 'roof'] as const).filter((k) => patch[k] !== undefined);
  const of = connection ? ` of ${connection}` : '';
  if (keys.length === 1) {
    const key = keys[0]!;
    const value = patch[key];
    if (value !== null && value !== undefined) return `Set the corridor ${key}${of} to ${CORRIDOR_VALUE_WORDS[value] ?? value}`;
    return connection ? `Use the design's corridor ${key} for ${connection}` : `Reset the corridor ${key}`;
  }
  if (keys.length > 0 && keys.every((k) => patch[k] === null)) return connection ? `Use the design's corridor look for ${connection}` : 'Reset the Corridors card';
  return `Change the corridor look${of}`;
}

/**
 * Short label for a schema-v2 command, in the app's vocabulary (rooms, connections, Building), using
 * the room ids (P4: the id is the label) of the document the command applies to.
 */
export function designCommandLabel(command: DesignCommand, doc: Pick<DesignDocumentV2, 'nodes'> & { readonly edges?: DesignDocumentV2['edges'] }): string {
  const room = (id: number) => {
    const node = doc.nodes.find((n) => n.id === id);
    return `room ${node ? nodeLabel(node) : id}`;
  };
  /** "3 → 7" for a relationship id; the raw id only if it is unknown. */
  const connection = (edgeId: number) => (doc.edges ? relationshipLabel({ edges: doc.edges }, edgeId) : String(edgeId));
  switch (command.type) {
    case 'add-node':
      // The command gives the new room the document's next node id.
      return `Add room ${'nextNodeId' in doc ? (doc as Pick<DesignDocumentV2, 'nextNodeId'>).nextNodeId : ''}`.trimEnd();
    case 'remove-node':
      return `Delete ${room(command.nodeId)}`;
    case 'set-node-geometry': {
      // Gizmos send grid AND size; name only what actually changes relative to the stored room.
      const stored = doc.nodes.find((n) => n.id === command.nodeId);
      const same = (a: readonly number[] | undefined, b: readonly number[] | undefined) =>
        a === undefined || (b !== undefined && a.every((v, i) => v === b[i]));
      const moves = command.position !== undefined && !same(command.position, stored?.position);
      const resizes = command.size !== undefined && !same(command.size, stored?.size);
      if (moves && resizes) return `Move and resize ${room(command.nodeId)}`;
      if (resizes) return `Resize ${room(command.nodeId)} to ${command.size!.join('×')}`;
      return `Move ${room(command.nodeId)} to [${(command.position ?? stored?.position ?? []).join(', ')}]`;
    }
    case 'set-node-type':
      return `Change the type of ${room(command.nodeId)}`;
    case 'set-node-custom':
      return `Edit the attributes of ${room(command.nodeId)}`;
    case 'set-diagram-position':
      return `Move ${room(command.nodeId)} in the diagram`;
    case 'add-edge':
      return `Add connection ${command.edge.source} → ${command.edge.target}`;
    case 'remove-edge':
      return `Remove connection ${connection(command.edgeId)}`;
    case 'remove-edges': {
      const n = command.edgeIds.length;
      return `Remove ${n} invalid connection${n === 1 ? '' : 's'}`;
    }
    case 'change-edge-kind':
      return `Change connection ${connection(command.edgeId)} to ${command.relationship === 'open' ? 'Open' : 'Access'}`;
    case 'set-edge-custom':
      return `Edit the attributes of connection ${connection(command.edgeId)}`;
    case 'set-edge-corridor':
      return corridorPatchLabel(command.patch, `connection ${connection(command.edgeId)}`);
    case 'set-corridors':
      return corridorPatchLabel(command.patch);
    case 'set-style-by':
      return 'Change what the rooms are styled by';
    case 'set-style-mode':
      return command.mode === 'bands' ? 'Style by bands' : 'Style by one card per value';
    case 'set-look':
      return command.group.kind === 'value' ? `Change Designer settings for ${String(command.group.value)}` : 'Change Designer settings';
    case 'remove-style-group':
      return `Remove the Designer card for ${String(command.value)}`;
    case 'set-band-dividers':
      return 'Change the Designer bands';
    default: {
      const unreachable: never = command;
      throw new Error(`unknown design command ${JSON.stringify(unreachable)}`);
    }
  }
}
