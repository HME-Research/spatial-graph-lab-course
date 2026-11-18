import { describe, expect, it } from 'vitest';
import { readDesign, type DesignDocumentV2 } from '@app/document/v2';
import { effectiveNodeValues, schemaSignature, type ActiveToolkit } from '@app/extensions';
import { labToolkit } from '@app/extensions/test-fixtures';
import { applyDesignCommandToSession, currentDocument, openDocument, undoDocument } from './documentSession';
import {
  attributeStorageKey,
  canUndoAttributes,
  currentSchema,
  differsFromFiles,
  editAttributes,
  exportAttributeFile,
  importAttributeFile,
  isAttributeSchemaModified,
  loadAttributeSession,
  markAttributesExported,
  attributeDiagnostics,
  discardUnreadableRecord,
  filesChangedSinceSaved,
  mergeFilesIntoSession,
  persistAttributeSession,
  redoAttributes,
  resetToFiles,
  undoAttributes,
  unreadableStorageKey,
  type AttributeSession,
  type KeyValueStorage,
} from './projectAttributeStore';

/** Phase 01: the project attribute schema in use — persistence, history and dirty state. */

function memoryStorage(): KeyValueStorage & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const throwing: KeyValueStorage = {
  getItem: () => {
    throw new Error('SecurityError: storage disabled');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {},
};

function addCapacity(session: AttributeSession): AttributeSession {
  const r = editAttributes(session, { type: 'add-field', collection: 'nodes', field: { key: 'capacity', kind: 'number', default: 4 } });
  if (!r.ok) throw new Error(r.reason);
  return r.session;
}

const doc = (name: string, nodes: unknown[]): DesignDocumentV2 => {
  const r = readDesign({ schemaVersion: 2, metadata: { name }, nodes, edges: [] });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value.doc;
};

async function projectNamed(id: 'lab', name: string, extra: Record<string, unknown> = {}): Promise<ActiveToolkit> {
  return labToolkit({ [`toolkits/${id}/toolkit.ts`]: { default: { name } }, ...extra });
}

describe('audit regressions (phase 01 review)', () => {
  it('an unreadable or newer stored record is never overwritten: saving is blocked until an explicit decision', async () => {
    const storage = memoryStorage();
    const newer = JSON.stringify({ format: 'spatial-graph-lab/project-attributes', formatVersion: 2, projectId: 'lab', schema: {}, baseline: 'x' });
    storage.setItem(attributeStorageKey('lab'), newer);
    storage.setItem(unreadableStorageKey('lab'), 'older backup');
    const project = await projectNamed('lab', 'Lab');
    const session = addCapacity(loadAttributeSession(storage, project));
    expect(session.saveBlocked).toMatch(/different app version/);
    expect(persistAttributeSession(storage, session)).toMatch(/^not saved/);
    expect(storage.data.get(attributeStorageKey('lab'))).toBe(newer);
    expect(storage.data.get(unreadableStorageKey('lab'))).toBe('older backup');
    expect(storage.data.get(`${unreadableStorageKey('lab')}-2`)).toBe(newer);
    expect(persistAttributeSession(storage, discardUnreadableRecord(session))).toBeNull();
    expect(storage.data.get(attributeStorageKey('lab'))).toMatch(/"formatVersion": 1/);
  });

  it('undoing a merge also restores the "toolkit files changed" state', async () => {
    const storage = memoryStorage();
    persistAttributeSession(storage, addCapacity(loadAttributeSession(storage, await projectNamed('lab', 'Lab'))));
    const kiosk = { id: 'kiosk', label: 'Kiosk', attributes: { open24h: { kind: 'boolean' } } };
    const changed = await projectNamed('lab', 'Lab', { 'toolkits/lab/types/kiosk.ts': { default: kiosk } });
    const session = loadAttributeSession(storage, changed);
    expect(filesChangedSinceSaved(session)).toBe(true);
    const merged = mergeFilesIntoSession(session, changed).session;
    expect(filesChangedSinceSaved(merged)).toBe(false);
    const undone = undoAttributes(merged);
    expect(filesChangedSinceSaved(undone)).toBe(true);
    persistAttributeSession(storage, undone);
    expect(loadAttributeSession(storage, changed).diagnostics.map((d) => d.code)).toEqual(['attribute-baseline-changed']);
  });

  it('an explicitly allowed import from another project is re-based on this project', async () => {
    const project = await projectNamed('lab', 'Lab');
    const file = exportAttributeFile({ ...addCapacity(loadAttributeSession(null, project)), projectId: 'other' });
    const imported = importAttributeFile(loadAttributeSession(null, project), file, { allowOtherProject: true });
    expect(imported.ok && filesChangedSinceSaved(imported.session)).toBe(false);
  });
});

describe('phase 10 audit: shown problems follow the session', () => {
  it('the unreadable-record error disappears once saving is unblocked; files-changed once merged', async () => {
    const storage = memoryStorage();
    storage.setItem(attributeStorageKey('lab'), '{ broken');
    const project = await projectNamed('lab', 'Lab');
    const blocked = loadAttributeSession(storage, project);
    expect(attributeDiagnostics(blocked).map((d) => d.severity)).toEqual(['error']);
    expect(attributeDiagnostics(discardUnreadableRecord(blocked))).toEqual([]);
    expect(attributeDiagnostics(resetToFiles(blocked, project))).toEqual([]);

    const fresh = memoryStorage();
    persistAttributeSession(fresh, addCapacity(loadAttributeSession(fresh, project)));
    const changed = await projectNamed('lab', 'Lab', { 'toolkits/lab/types/kiosk.ts': { default: { id: 'kiosk', label: 'Kiosk', attributes: { open24h: { kind: 'boolean' } } } } });
    const session = loadAttributeSession(fresh, changed);
    expect(attributeDiagnostics(session).map((d) => d.code)).toEqual(['attribute-baseline-changed']);
    expect(attributeDiagnostics(mergeFilesIntoSession(session, changed).session)).toEqual([]);
  });
});

describe('project attribute session', () => {
  it('starts from the toolkit files when nothing is stored, and stores nothing until changed', async () => {
    const storage = memoryStorage();
    const project = await projectNamed('lab', 'Lab');
    const session = loadAttributeSession(storage, project);
    expect([session.origin, isAttributeSchemaModified(session), differsFromFiles(session)]).toEqual(['files', false, false]);
    expect(schemaSignature(currentSchema(session))).toBe(project.attributeBaseline.signature);
    expect(persistAttributeSession(storage, session)).toBeNull();
    expect(storage.data.size).toBe(0);
  });

  it('a field added while design A is open is saved and seen by design B after a reload', async () => {
    const storage = memoryStorage();
    const project = await projectNamed('lab', 'Lab');
    const designA = doc('A', [{ id: 'a1', grid: [0, 0, 0], typeId: 'gallery' }]);
    const designB = doc('B', [{ id: 'b1', grid: [0, 0, 0], typeId: 'studio', attributes: { capacity: 9 } }]);

    const edited = addCapacity(loadAttributeSession(storage, project));
    expect(effectiveNodeValues(currentSchema(edited), designA.nodes[0]!)['capacity']).toBe(4);
    expect(persistAttributeSession(storage, edited)).toBeNull();

    // "Reload": a new activation of the same project reads the stored record.
    const reloaded = loadAttributeSession(storage, await projectNamed('lab', 'Lab'));
    expect(reloaded.origin).toBe('browser');
    expect(currentSchema(reloaded).nodes.map((f) => f.key)).toContain('capacity');
    expect(effectiveNodeValues(currentSchema(reloaded), designB.nodes[0]!)['capacity']).toBe(9);
    expect(isAttributeSchemaModified(reloaded)).toBe(true); // not exported yet
  });

  it('projects never share stored schemas', async () => {
    const storage = memoryStorage();
    const lab = await projectNamed('lab', 'Lab');
    persistAttributeSession(storage, addCapacity(loadAttributeSession(storage, lab)));
    const other: ActiveToolkit = { ...lab, id: 'other' };
    expect(currentSchema(loadAttributeSession(storage, other)).nodes.map((f) => f.key)).not.toContain('capacity');
    expect([...storage.data.keys()].every((k) => k.startsWith('sgl:project-attributes:lab'))).toBe(true);
  });

  it('schema undo/redo is its own history; design history and data are untouched', async () => {
    const project = await projectNamed('lab', 'Lab');
    const design = doc('A', [{ id: 'a1', grid: [0, 0, 0], typeId: 'gallery' }]);
    let designSession = openDocument(design, 'a.json', null);
    const moved = applyDesignCommandToSession(designSession, { type: 'set-node-geometry', nodeId: 'a1', grid: [2, 0, 0] });
    if (!moved.ok) throw new Error('move failed');
    designSession = moved.session;

    const schemaSession = addCapacity(loadAttributeSession(null, project));
    expect(canUndoAttributes(schemaSession)).toBe(true);
    const undone = undoAttributes(schemaSession);
    expect(currentSchema(undone).nodes.map((f) => f.key)).not.toContain('capacity');
    expect(currentSchema(redoAttributes(undone)).nodes.map((f) => f.key)).toContain('capacity');
    // Design undo only undoes the design move; the schema is not part of it.
    expect(currentDocument(undoDocument(designSession)).nodes[0]!.grid).toEqual([0, 0, 0]);
    expect(currentDocument(designSession)).toBe(moved.session.history.present);
    expect(undone.revision).toBeGreaterThan(schemaSession.revision);
  });

  it('a refused edit changes nothing', async () => {
    const session = loadAttributeSession(null, await projectNamed('lab', 'Lab'));
    const r = editAttributes(session, { type: 'add-field', collection: 'nodes', field: { key: 'size', kind: 'number' } });
    expect(r.ok).toBe(false);
  });

  it('export marks clean; import validates and is one undoable step', async () => {
    const project = await projectNamed('lab', 'Lab');
    const edited = addCapacity(loadAttributeSession(null, project));
    const file = exportAttributeFile(edited, '2026-11-16T00:00:00.000Z');
    const clean = markAttributesExported(edited);
    expect(isAttributeSchemaModified(clean)).toBe(false);

    const fresh = loadAttributeSession(null, project);
    const imported = importAttributeFile(fresh, file);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(currentSchema(imported.session).nodes.map((f) => f.key)).toContain('capacity');
    expect(isAttributeSchemaModified(imported.session)).toBe(false);
    expect(currentSchema(undoAttributes(imported.session)).nodes.map((f) => f.key)).not.toContain('capacity');

    const wrong = importAttributeFile({ ...fresh, projectId: 'other' }, file);
    expect(wrong.ok ? 'ok' : wrong.issues[0]!.code).toBe('attribute-schema-project-mismatch');
    const garbage = importAttributeFile(fresh, '{"format":"spatial-graph-lab/project-attributes"}');
    expect(garbage.ok).toBe(false);
  });

  it('unreadable stored data is backed up, reported and replaced by the files version', async () => {
    const storage = memoryStorage();
    storage.setItem(attributeStorageKey('lab'), '{ broken');
    const session = loadAttributeSession(storage, await projectNamed('lab', 'Lab'));
    expect(session.origin).toBe('files');
    expect(session.diagnostics[0]?.code).toBe('attribute-schema-storage');
    expect(session.diagnostics[0]?.severity).toBe('error');
    expect(storage.data.get(unreadableStorageKey('lab'))).toBe('{ broken');
  });

  it('unavailable storage: works in memory with a warning; saving reports the error', async () => {
    const session = loadAttributeSession(throwing, await projectNamed('lab', 'Lab'));
    expect(session.diagnostics[0]?.severity).toBe('warning');
    expect(persistAttributeSession(throwing, addCapacity(session))).toMatch(/Quota/);
  });

  it('detects changed toolkit files and merges them only on request (additive)', async () => {
    const storage = memoryStorage();
    persistAttributeSession(storage, addCapacity(loadAttributeSession(storage, await projectNamed('lab', 'Lab'))));
    const kiosk = { id: 'kiosk', label: 'Kiosk', attributes: { open24h: { kind: 'boolean', default: true } } };
    const changed = await projectNamed('lab', 'Lab', { 'toolkits/lab/types/kiosk.ts': { default: kiosk } });
    const session = loadAttributeSession(storage, changed);
    expect(session.diagnostics.map((d) => d.code)).toEqual(['attribute-baseline-changed']);
    expect(currentSchema(session).nodes.map((f) => f.key)).not.toContain('open24h');
    const merged = mergeFilesIntoSession(session, changed);
    expect(merged.added).toEqual(['node field "open24h"', 'default of "open24h" for type "kiosk"']);
    expect(currentSchema(merged.session).nodes.map((f) => f.key)).toEqual(['daylight', 'public', 'occupancy', 'capacity', 'open24h']);
    persistAttributeSession(storage, merged.session);
    expect(loadAttributeSession(storage, changed).diagnostics).toEqual([]);
    // Reset returns exactly to the files; undo restores the customised schema.
    const reset = resetToFiles(merged.session, changed);
    expect(differsFromFiles(reset)).toBe(false);
    expect(currentSchema(undoAttributes(reset)).nodes.map((f) => f.key)).toContain('capacity');
  });

  it('an untouched project after undo back to the files leaves no stored record', async () => {
    const storage = memoryStorage();
    const project = await projectNamed('lab', 'Lab');
    const edited = addCapacity(loadAttributeSession(storage, project));
    persistAttributeSession(storage, edited);
    expect(storage.data.has(attributeStorageKey('lab'))).toBe(true);
    persistAttributeSession(storage, undoAttributes(edited));
    expect(storage.data.has(attributeStorageKey('lab'))).toBe(false);
  });
});
