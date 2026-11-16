import {
  applySchemaEdit,
  diagnostic,
  makeAttributeRecord,
  mergeBaseline,
  readAttributeRecord,
  schemaSignature,
  serializeAttributeRecord,
  type ActiveProject,
  type EditContext,
  type ExtensionDiagnostic,
  type ProjectAttributeSchema,
  type SchemaEdit,
} from '@app/extensions';
import { canRedo, canUndo, createHistory, record, redo, redoLabel, undo, undoLabel, type History } from './history';

/**
 * The project's attribute schema IN USE, with its own undo history and persistence. See
 * docs/PROJECT-ATTRIBUTES.md.
 *
 * - **Owner.** One record per project in browser storage (`sgl:project-attributes:<projectId>`).
 *   When none exists, the schema derived from the project's files (`ActiveProject.attributeBaseline`)
 *   is used. Every schema change is persisted at once by the host (`persistAttributeSession`), so
 *   every design opened in this project — in this browser, now or after a reload — sees it.
 * - **History.** Schema edits have their own undo/redo, independent of the open design's history.
 *   Schema edits never change design data and design edits never change the schema. A history
 *   step holds the schema AND the files' signature it was based on, so undoing a merge or reset
 *   also restores the "project files changed" state.
 * - **Never overwrite what cannot be read.** A stored record that cannot be read (corrupt, or
 *   written by a newer app version) is copied to a backup key and saving is BLOCKED until the user
 *   explicitly replaces it (import, reset to the files, or "discard the unreadable copy").
 * - **Modified** means changed since the last export/import of the attribute file (or, if never
 *   exported, since the project files' version).
 *
 * Pure: every transition returns a new session (or the same object for a no-op). Storage access
 * is limited to `loadAttributeSession` / `persistAttributeSession` with an injectable storage.
 */

/** The part of the Web Storage API used here (injectable for tests and private-mode failures). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const attributeStorageKey = (projectId: string): string => `sgl:project-attributes:${projectId}`;
export const exportedStorageKey = (projectId: string): string => `sgl:project-attributes:${projectId}:exported`;
export const unreadableStorageKey = (projectId: string): string => `sgl:project-attributes:${projectId}:unreadable`;

export type AttributeOrigin = 'files' | 'browser';

/** One history step: the schema and the files' signature it was created from or merged with. */
export interface AttributeState {
  readonly schema: ProjectAttributeSchema;
  readonly recordBaseline: string;
}

export interface AttributeSession {
  readonly projectId: string;
  readonly history: History<AttributeState>;
  /** Signature of the schema derived from the project's files NOW. */
  readonly filesSignature: string;
  /** Signature of the last exported/imported schema (the "clean" state). */
  readonly exportedSignature: string;
  /** Where the schema came from when the project was activated. */
  readonly origin: AttributeOrigin;
  /** Increases on every change of the schema in use (edit, undo, redo, import, merge). */
  readonly revision: number;
  /** Loading/storage problems to show persistently. */
  readonly diagnostics: readonly ExtensionDiagnostic[];
  /** Set while an unreadable stored record must not be overwritten (reason for the user). */
  readonly saveBlocked?: string;
}

export const currentSchema = (session: AttributeSession): ProjectAttributeSchema => session.history.present.schema;

/**
 * The problems to show NOW: a load-time "could not be read" error disappears once saving is no
 * longer blocked (import, reset, discard), and "project files changed" once the files are merged
 * or reset (phase 10 audit). Storage-unavailable warnings stay.
 */
export function attributeDiagnostics(session: AttributeSession): readonly ExtensionDiagnostic[] {
  return session.diagnostics.filter((d) => {
    if (d.code === 'attribute-schema-storage' && d.severity === 'error') return session.saveBlocked !== undefined;
    if (d.code === 'attribute-baseline-changed') return session.history.present.recordBaseline !== session.filesSignature;
    return true;
  });
}
export const currentRecordBaseline = (session: AttributeSession): string => session.history.present.recordBaseline;

const sameState = (a: AttributeState, b: AttributeState) =>
  a === b || (a.recordBaseline === b.recordBaseline && schemaSignature(a.schema) === schemaSignature(b.schema));

function safeGet(storage: KeyValueStorage | null, key: string): { value: string | null; error?: string } {
  if (!storage) return { value: null, error: 'no browser storage' };
  try {
    return { value: storage.getItem(key) };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : String(error) };
  }
}

/** The schema in use for `project` at activation. Never throws; problems become diagnostics. */
export function loadAttributeSession(storage: KeyValueStorage | null, project: ActiveProject): AttributeSession {
  const baseline = project.attributeBaseline;
  const subject = { kind: 'project', id: project.id } as const;
  const diagnostics: ExtensionDiagnostic[] = [];
  const fromFiles = (saveBlocked?: string): AttributeSession => ({
    projectId: project.id,
    history: createHistory({ schema: baseline.schema, recordBaseline: baseline.signature }),
    filesSignature: baseline.signature,
    exportedSignature: baseline.signature,
    origin: 'files',
    revision: 1,
    diagnostics,
    ...(saveBlocked !== undefined && { saveBlocked }),
  });

  const stored = safeGet(storage, attributeStorageKey(project.id));
  if (stored.error !== undefined) {
    diagnostics.push(
      diagnostic('attribute-schema-storage', 'warning', subject, `browser storage is not available (${stored.error}): attribute changes will be lost when the page is reloaded; use Export to keep them`),
    );
    return fromFiles();
  }
  if (stored.value === null) return fromFiles();

  const read = readAttributeRecord(stored.value, { projectId: project.id });
  if (!read.ok) {
    // Keep every unreadable copy: never overwrite an earlier backup.
    let backup = unreadableStorageKey(project.id);
    let backedUp = false;
    try {
      for (let n = 2; storage?.getItem(backup) !== null && storage?.getItem(backup) !== stored.value; n++) backup = `${unreadableStorageKey(project.id)}-${n}`;
      storage?.setItem(backup, stored.value);
      backedUp = true;
    } catch {
      // The original stays under its own key while saving is blocked; the message says so.
    }
    const newer = read.issues.some((i) => i.code === 'attribute-schema-version');
    const reason = `${newer ? 'the saved project attributes were written by a different app version' : 'the saved project attributes could not be read'} (${read.issues.map((i) => i.message).join('; ')})`;
    diagnostics.push(
      diagnostic(
        'attribute-schema-storage',
        'error',
        subject,
        `${reason}. The fields from the project files are shown. Changes are NOT saved until you import an attribute file, reset to the project files or discard the saved copy; ${backedUp ? `a copy is kept in browser storage under "${backup}"` : "NO backup copy could be written, so discarding loses the saved record for good"}`,
      ),
    );
    return fromFiles(reason);
  }
  const schema = read.value.schema;
  if (read.value.baseline !== baseline.signature) {
    diagnostics.push(
      diagnostic(
        'attribute-baseline-changed',
        'warning',
        subject,
        'the project files declare attributes differently from when this browser saved the project attributes. The saved fields are used; use “Add fields from project files” to merge new ones',
      ),
    );
  }
  const exported = safeGet(storage, exportedStorageKey(project.id)).value;
  return {
    projectId: project.id,
    history: createHistory({ schema, recordBaseline: read.value.baseline }),
    filesSignature: baseline.signature,
    exportedSignature: exported ?? read.value.baseline,
    origin: 'browser',
    revision: 1,
    diagnostics,
  };
}

/**
 * Write the schema in use to storage. Returns an error message when it could not be saved (the
 * session keeps working in memory). A schema identical to the project files that was never
 * exported differently is stored as nothing at all: no record means "use the project files".
 */
export function persistAttributeSession(storage: KeyValueStorage | null, session: AttributeSession, now: () => string = () => new Date().toISOString()): string | null {
  if (session.saveBlocked !== undefined) return `not saved: ${session.saveBlocked}`;
  if (!storage) return 'browser storage is not available';
  const schema = currentSchema(session);
  const recordBaseline = currentRecordBaseline(session);
  try {
    if (recordBaseline === session.filesSignature && schemaSignature(schema) === session.filesSignature && session.exportedSignature === session.filesSignature) {
      storage.removeItem(attributeStorageKey(session.projectId));
      storage.removeItem(exportedStorageKey(session.projectId));
      return null;
    }
    storage.setItem(attributeStorageKey(session.projectId), serializeAttributeRecord(makeAttributeRecord(session.projectId, schema, recordBaseline, now())));
    storage.setItem(exportedStorageKey(session.projectId), session.exportedSignature);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Explicit user decision: the unreadable saved copy may be replaced (its backup is kept). */
export function discardUnreadableRecord(session: AttributeSession): AttributeSession {
  if (session.saveBlocked === undefined) return session;
  const { saveBlocked: _gone, ...rest } = session;
  return rest;
}

function commit(session: AttributeSession, state: AttributeState, label: string): AttributeSession {
  const history = record(session.history, state, label, sameState);
  return history === session.history ? session : { ...session, history, revision: session.revision + 1 };
}

export type AttributeEditResult =
  | { readonly ok: true; readonly session: AttributeSession; readonly label: string; readonly fieldId?: string }
  | { readonly ok: false; readonly reason: string };

/** Apply one schema edit as one schema-history step. A refusal leaves the session untouched. */
export function editAttributes(session: AttributeSession, edit: SchemaEdit, context: EditContext = {}): AttributeEditResult {
  const outcome = applySchemaEdit(currentSchema(session), edit, context);
  if (!outcome.ok) return outcome;
  const next = commit(session, { schema: outcome.schema, recordBaseline: currentRecordBaseline(session) }, outcome.label);
  return { ok: true, session: next, label: outcome.label, ...(outcome.fieldId !== undefined && { fieldId: outcome.fieldId }) };
}

export function undoAttributes(session: AttributeSession): AttributeSession {
  const history = undo(session.history);
  return history === session.history ? session : { ...session, history, revision: session.revision + 1 };
}

export function redoAttributes(session: AttributeSession): AttributeSession {
  const history = redo(session.history);
  return history === session.history ? session : { ...session, history, revision: session.revision + 1 };
}

export const canUndoAttributes = (s: AttributeSession): boolean => canUndo(s.history);
export const canRedoAttributes = (s: AttributeSession): boolean => canRedo(s.history);
export const attributeUndoLabel = (s: AttributeSession): string | null => undoLabel(s.history);
export const attributeRedoLabel = (s: AttributeSession): string | null => redoLabel(s.history);

/** Changed since the last export/import (or since the project files' version). */
export const isAttributeSchemaModified = (session: AttributeSession): boolean =>
  schemaSignature(currentSchema(session)) !== session.exportedSignature;

/** Differs from what the project files describe (i.e. customised in this browser). */
export const differsFromFiles = (session: AttributeSession): boolean => schemaSignature(currentSchema(session)) !== session.filesSignature;

/** The project files declare attributes the schema in use was not merged with. */
export const filesChangedSinceSaved = (session: AttributeSession): boolean => currentRecordBaseline(session) !== session.filesSignature;

/** The attribute file to download for the schema in use. */
export const exportAttributeFile = (session: AttributeSession, now?: string): string =>
  serializeAttributeRecord(makeAttributeRecord(session.projectId, currentSchema(session), currentRecordBaseline(session), now));

/** After a successful download: the exported schema is the clean state. */
export function markAttributesExported(session: AttributeSession): AttributeSession {
  const signature = schemaSignature(currentSchema(session));
  return signature === session.exportedSignature ? session : { ...session, exportedSignature: signature };
}

/**
 * Replace the schema in use with an imported attribute file (validated: format, version, project
 * id, schema). One undoable schema-history step. Stored design values are untouched. A file of
 * another project (explicitly allowed) is re-based on this project's files.
 */
export function importAttributeFile(session: AttributeSession, text: string, options: { readonly allowOtherProject?: boolean } = {}):
  | { readonly ok: true; readonly session: AttributeSession }
  | { readonly ok: false; readonly issues: readonly ExtensionDiagnostic[] } {
  const read = readAttributeRecord(text, { projectId: session.projectId, ...(options.allowOtherProject !== undefined && { allowOtherProject: options.allowOtherProject }) });
  if (!read.ok) return { ok: false, issues: read.issues };
  const raw = JSON.parse(text) as { projectId?: unknown };
  const foreign = raw.projectId !== session.projectId;
  const schema = read.value.schema;
  const history = record(session.history, { schema, recordBaseline: foreign ? session.filesSignature : read.value.baseline }, 'Import project attributes', sameState);
  const { saveBlocked: _replaced, ...rest } = session;
  return { ok: true, session: { ...rest, history, exportedSignature: schemaSignature(schema), revision: session.revision + 1 } };
}

/** Add fields and type defaults the project files declare but the schema in use lacks (one step). */
export function mergeFilesIntoSession(session: AttributeSession, project: ActiveProject): { readonly session: AttributeSession; readonly added: readonly string[] } {
  const merged = mergeBaseline(currentSchema(session), project.attributeBaseline.schema);
  const next = commit(session, { schema: merged.schema, recordBaseline: project.attributeBaseline.signature }, 'Add fields from project files');
  return { session: next, added: merged.added };
}

/** Use exactly what the project files describe (one undoable step; also unblocks saving). */
export function resetToFiles(session: AttributeSession, project: ActiveProject): AttributeSession {
  const next = commit(discardUnreadableRecord(session), { schema: project.attributeBaseline.schema, recordBaseline: project.attributeBaseline.signature }, 'Reset attributes to the project files');
  return next;
}
