import { describe, expect, it } from 'vitest';
import { isBaselineField, projectOnlyToolkit, type ActiveToolkit, type AttributeCollection, type ProjectAttributeSchema } from '@app/extensions';
import { labToolkit } from '@app/extensions/test-fixtures';
import {
  currentSchema,
  editAttributesBatch,
  exportAttributeFile,
  importAttributeFile,
  loadAttributeSession,
  persistAttributeSession,
  resetToFiles,
  type AttributeSession,
  type KeyValueStorage,
} from '@app/session/projectAttributeStore';
import { readProjectFile, serializeProjectFile } from '@app/project';
import { fileOf } from '@app/session/projectStore.fixtures';
import { readAttributeRecord } from '@app/extensions';
import { customAttributeSourceOf, toolkitDeleteRefusal } from './attributeSources';
import { customAttributeSource as viewHelper } from './sections';
import { customAttributeTag } from './sections';

/** Origin tracking of custom attributes (Programme P4, item C): derived from the toolkit baseline, never stored. */

const memoryStorage = (): KeyValueStorage => {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};

const edit = (session: AttributeSession, ...edits: Parameters<typeof editAttributesBatch>[1]): AttributeSession => {
  const r = editAttributesBatch(session, edits, 'Edit');
  if (!r.ok) throw new Error(r.reason);
  return r.session;
};

/** "key → tag" for every field of a collection. */
const tags = (schema: ProjectAttributeSchema, collection: AttributeCollection, toolkit: ActiveToolkit | null): Record<string, string> =>
  Object.fromEntries(schema[collection].map((f) => [f.key, customAttributeTag(customAttributeSourceOf(f, collection, toolkit))]));

describe('custom attribute origin', () => {
  it('fields the toolkit files declare are "Toolkit: <name>"; fields the student adds are "Yours"', async () => {
    const toolkit = await labToolkit();
    const session = edit(loadAttributeSession(null, toolkit), { type: 'add-field', collection: 'nodes', field: { key: 'finish', label: 'Finish', kind: 'text' } });
    expect(tags(currentSchema(session), 'nodes', toolkit)).toEqual({ daylight: 'Toolkit: Lab', public: 'Toolkit: Lab', occupancy: 'Toolkit: Lab', finish: 'Yours' });
  });

  it('survives renames: label-only and key renames (the former key still matches the baseline)', async () => {
    const toolkit = await labToolkit();
    let session = loadAttributeSession(null, toolkit);
    session = edit(session, { type: 'update-field', collection: 'nodes', fieldId: 'daylight', patch: { label: 'Light level' } });
    session = edit(session, { type: 'rename-field', collection: 'nodes', fieldId: 'occupancy', key: 'people' });
    const schema = currentSchema(session);
    expect(schema.nodes.find((f) => f.id === 'daylight')!.label).toBe('Light level');
    expect(tags(schema, 'nodes', toolkit)).toMatchObject({ daylight: 'Toolkit: Lab', people: 'Toolkit: Lab' });
  });

  it('survives a reload, an attribute-record export/import and a project save/open (nothing new is stored)', async () => {
    const toolkit = await labToolkit();
    const storage = memoryStorage();
    const session = edit(loadAttributeSession(storage, toolkit), { type: 'add-field', collection: 'edges', field: { key: 'width', label: 'Width', kind: 'number' } });
    expect(persistAttributeSession(storage, session)).toBeNull();
    const expected = { nodes: tags(currentSchema(session), 'nodes', toolkit), edges: tags(currentSchema(session), 'edges', toolkit) };
    expect(expected.edges).toEqual({ width: 'Yours' });

    // Reload: the stored record + the re-derived baseline.
    const reloaded = currentSchema(loadAttributeSession(storage, toolkit));
    expect({ nodes: tags(reloaded, 'nodes', toolkit), edges: tags(reloaded, 'edges', toolkit) }).toEqual(expected);

    // Export → import into a fresh session.
    const text = exportAttributeFile(session, '2026-11-19T00:00:00.000Z');
    expect(text).not.toMatch(/origin|toolkitName|"source"/);
    const imported = importAttributeFile(loadAttributeSession(null, toolkit), text);
    if (!imported.ok) throw new Error('import');
    const importedSchema = currentSchema(imported.session);
    expect({ nodes: tags(importedSchema, 'nodes', toolkit), edges: tags(importedSchema, 'edges', toolkit) }).toEqual(expected);

    // Project file: the record travels inside it unchanged.
    const file = { ...fileOf(), toolkit: { id: 'lab' }, attributes: JSON.parse(text) as unknown };
    const reopened = readProjectFile(JSON.parse(serializeProjectFile(file)));
    if (!reopened.ok) throw new Error(JSON.stringify(reopened.issues));
    const record = readAttributeRecord(JSON.stringify(reopened.value.attributes), { projectId: 'lab' });
    if (!record.ok) throw new Error('record');
    expect({ nodes: tags(record.value.schema, 'nodes', toolkit), edges: tags(record.value.schema, 'edges', toolkit) }).toEqual(expected);
  });

  it('a project without a toolkit has only your attributes; no active toolkit means yours too', () => {
    const bare = projectOnlyToolkit('project-abc');
    const session = edit(loadAttributeSession(null, bare), { type: 'add-field', collection: 'nodes', field: { key: 'daylight', label: 'Daylight', kind: 'text' } });
    expect(tags(currentSchema(session), 'nodes', bare)).toEqual({ daylight: 'Yours' });
    expect(customAttributeSourceOf({ key: 'daylight' }, 'nodes', null)).toEqual({ kind: 'yours' });
    // The pure helper in sections.ts (importable by views, e.g. the Data table) is the same function.
    expect(viewHelper).toBe(customAttributeSourceOf);
  });

  it('matches keys ignoring case, per collection (the rule mergeBaseline uses)', async () => {
    const toolkit = await labToolkit();
    const baseline = toolkit.attributeBaseline.schema;
    expect(isBaselineField({ key: 'DAYLIGHT' }, 'nodes', baseline)).toBe(true);
    expect(isBaselineField({ key: 'daylight' }, 'edges', baseline)).toBe(false);
    expect(isBaselineField({ key: 'light', formerKeys: ['daylight'] }, 'nodes', baseline)).toBe(true);
  });

  it('refuses deleting a toolkit attribute, even outside the panel’s row actions; yours can be deleted', async () => {
    const toolkit = await labToolkit();
    const session = edit(loadAttributeSession(null, toolkit), { type: 'add-field', collection: 'nodes', field: { key: 'finish', label: 'Finish', kind: 'text' } });
    const schema = currentSchema(session);
    expect(toolkitDeleteRefusal([{ type: 'delete-field', collection: 'nodes', fieldId: 'daylight' }], schema, toolkit)).toMatch(/“Daylight” comes from the toolkit “Lab”, so it cannot be deleted/);
    expect(toolkitDeleteRefusal([{ type: 'delete-field', collection: 'nodes', fieldId: 'finish' }], schema, toolkit)).toBeNull();
    // Reset to the toolkit files keeps exactly the toolkit's attributes (all tagged as the toolkit's).
    const reset = currentSchema(resetToFiles(session, toolkit));
    expect(Object.values(tags(reset, 'nodes', toolkit)).every((t) => t === 'Toolkit: Lab')).toBe(true);
  });
});
