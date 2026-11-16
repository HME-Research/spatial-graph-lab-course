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
 *   Schema edits never change design data and design edits never change the schema.
 * - **Modified** means changed since the last export/import of the attribute file (or, if never
 *   exported, since the project files' version). It is a reminder to export, like a design's
 *   "modified (not exported)".
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

export interface AttributeSession {
  readonly projectId: string;
  readonly history: History<ProjectAttributeSchema>;
  /** Signature of the schema derived from the project's files NOW. */
  readonly filesSignature: string;
  /** Files signature the stored schema was created from or last merged with. */
  readonly recordBaseline: string;
  /** Signature of the last exported/imported schema (the "clean" state). */
  readonly exportedSignature: string;
  /** Where the schema came from when the project was activated. */
  readonly origin: AttributeOrigin;
  /** Increases on every change of the schema in use (edit, undo, redo, import, merge). */
  readonly revision: number;
  /** Loading/storage problems to show persistently. */
  readonly diagnostics: readonly ExtensionDiagnostic[];
}

export const currentSchema = (session: AttributeSession): ProjectAttributeSchema => session.history.present;

const sameSchema = (a: ProjectAttributeSchema, b: ProjectAttributeSchema) => a === b || schemaSignature(a) === schemaSignature(b);

function safeGet(storage: KeyValueStorage | null, key: string): { value: string | null; error?: string } {
  if (!storage) return { value: null };
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
  const fromFiles = (): AttributeSession => ({
    projectId: project.id,
    history: createHistory(baseline.schema),
    filesSignature: baseline.signature,
    recordBaseline: baseline.signature,
    exportedSignature: baseline.signature,
    origin: 'files',
    revision: 1,
    diagnostics,
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
    try {
      storage?.setItem(unreadableStorageKey(project.id), stored.value);
    } catch {
      // Best effort: the original stays under its own key until the next successful save.
    }
    diagnostics.push(
      diagnostic(
        'attribute-schema-storage',
        'error',
        subject,
        `the saved attribute schema of this project could not be read (${read.issues.map((i) => i.message).join('; ')}). The fields from the project files are used; the unreadable copy is kept in browser storage under "${unreadableStorageKey(project.id)}"`,
      ),
    );
    return fromFiles();
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
    history: createHistory(schema),
    filesSignature: baseline.signature,
    recordBaseline: read.value.baseline,
    exportedSignature: exported ?? read.value.baseline,
    origin: 'browser',
    revision: 1,
    diagnostics,
  };
}

/**
 * Write the schema in use to storage. Returns an error message when it could not be saved (the
 * session keeps working in memory). The files' version is stored as nothing at all: removing the
 * record means "use the project files", so an untouched project leaves no data behind.
 */
export function persistAttributeSession(storage: KeyValueStorage | null, session: AttributeSession, now: () => string = () => new Date().toISOString()): string | null {
  if (!storage) return 'browser storage is not available';
  const schema = currentSchema(session);
  try {
    if (session.recordBaseline === session.filesSignature && schemaSignature(schema) === session.filesSignature && session.exportedSignature === session.filesSignature) {
      storage.removeItem(attributeStorageKey(session.projectId));
      storage.removeItem(exportedStorageKey(session.projectId));
      return null;
    }
    storage.setItem(attributeStorageKey(session.projectId), serializeAttributeRecord(makeAttributeRecord(session.projectId, schema, session.recordBaseline, now())));
    storage.setItem(exportedStorageKey(session.projectId), session.exportedSignature);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function commit(session: AttributeSession, schema: ProjectAttributeSchema, label: string, extra: Partial<AttributeSession> = {}): AttributeSession {
  const history = record(session.history, schema, label, sameSchema);
  if (history === session.history && Object.keys(extra).length === 0) return session;
  return { ...session, ...extra, history, revision: session.revision + 1 };
}

export type AttributeEditResult =
  | { readonly ok: true; readonly session: AttributeSession; readonly label: string; readonly fieldId?: string }
  | { readonly ok: false; readonly reason: string };

/** Apply one schema edit as one schema-history step. A refusal leaves the session untouched. */
export function editAttributes(session: AttributeSession, edit: SchemaEdit, context: EditContext = {}): AttributeEditResult {
  const outcome = applySchemaEdit(currentSchema(session), edit, context);
  if (!outcome.ok) return outcome;
  return { ok: true, session: commit(session, outcome.schema, outcome.label), label: outcome.label, ...(outcome.fieldId !== undefined && { fieldId: outcome.fieldId }) };
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

/** The attribute file to download for the schema in use. */
export const exportAttributeFile = (session: AttributeSession, now?: string): string =>
  serializeAttributeRecord(makeAttributeRecord(session.projectId, currentSchema(session), session.recordBaseline, now));

/** After a successful download: the exported schema is the clean state. */
export function markAttributesExported(session: AttributeSession): AttributeSession {
  const signature = schemaSignature(currentSchema(session));
  return signature === session.exportedSignature ? session : { ...session, exportedSignature: signature };
}

/**
 * Replace the schema in use with an imported attribute file (validated: format, version, project
 * id, schema). One undoable schema-history step. Stored design values are untouched.
 */
export function importAttributeFile(session: AttributeSession, text: string, options: { readonly allowOtherProject?: boolean } = {}):
  | { readonly ok: true; readonly session: AttributeSession }
  | { readonly ok: false; readonly issues: readonly ExtensionDiagnostic[] } {
  const read = readAttributeRecord(text, { projectId: session.projectId, ...(options.allowOtherProject !== undefined && { allowOtherProject: options.allowOtherProject }) });
  if (!read.ok) return { ok: false, issues: read.issues };
  const schema = read.value.schema;
  const signature = schemaSignature(schema);
  const history = record(session.history, schema, 'Import project attributes', sameSchema);
  return {
    ok: true,
    session: { ...session, history, recordBaseline: read.value.baseline, exportedSignature: signature, revision: session.revision + 1 },
  };
}

/** Add fields and type defaults the project files declare but the schema in use lacks (one step). */
export function mergeFilesIntoSession(session: AttributeSession, project: ActiveProject): { readonly session: AttributeSession; readonly added: readonly string[] } {
  const merged = mergeBaseline(currentSchema(session), project.attributeBaseline.schema);
  const next = commit(session, merged.schema, 'Add fields from project files', { recordBaseline: project.attributeBaseline.signature });
  return { session: next, added: merged.added };
}

/** Use exactly what the project files describe (one undoable step). */
export function resetToFiles(session: AttributeSession, project: ActiveProject): AttributeSession {
  return commit(session, project.attributeBaseline.schema, 'Reset attributes to the project files', { recordBaseline: project.attributeBaseline.signature });
}
