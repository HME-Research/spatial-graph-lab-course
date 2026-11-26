import { beforeAll, describe, expect, it } from 'vitest';
import { activateToolkit, discoverToolkits, EMPTY_ATTRIBUTE_SCHEMA, planToolkitAttach, TOOLKIT_GLOBS, REFERENCE_TOOLKIT_FILES, type ActiveToolkit, type StoredToolkit, type UploadRunner } from '@app/extensions';
import { handleUploadRequest } from '@app/extensions/uploadSandbox';
import { readProjectFile, serializeProjectFile, type ProjectFileV2 } from '@app/project';
import { readToolkitZip, toolkitZipBytes } from '@app/welcome/toolkitUpload';
import { loadUploadedToolkit } from '@app/extensions';
import { design, fixtureIds } from './projectStore.fixtures';
import { attachToolkit, newProjectFromDesign, openProject, projectFileOf, setUploadedToolkit } from './projectStore';

/**
 * Uploaded toolkits in the project (owner 2026-11-26): `settings.uploadedToolkit` round-trips and
 * is additive; Download toolkit (.zip) gives back a zip that uploads to the same files; a toolkit
 * can be added to a project without one, refused when its attributes clash.
 */

const inProcess: UploadRunner = async (request) => structuredClone(handleUploadRequest(structuredClone(request)));
const load = (stored: StoredToolkit) => loadUploadedToolkit(stored, inProcess);

let house: StoredToolkit;
let houseToolkit: ActiveToolkit;
beforeAll(async () => {
  const files = [];
  for (const [path, read] of Object.entries(REFERENCE_TOOLKIT_FILES)) files.push({ path: path.replace('/toolkits/house/', ''), text: await read() });
  files.push({ path: 'assets/tiny.3dm', base64: 'AAECAw==' } as never);
  files.sort((a, b) => (a.path < b.path ? -1 : 1));
  house = { name: 'u000-he-house', uploadedAt: '2026-11-26T12:00:00.000Z', files };
  const source = discoverToolkits(TOOLKIT_GLOBS).toolkits.find((t) => t.id === 'house')!;
  const activation = await activateToolkit(source);
  if (activation.status !== 'active') throw new Error('house');
  houseToolkit = activation.toolkit;
});

const rooms = () =>
  design({
    schemaVersion: 2,
    metadata: { name: 'Mine' },
    nodes: [
      { id: 1, position: [0, 0, 0], function: 'kitchen', custom: { note: 'sunny' } },
      { id: 2, position: [1, 0, 0], function: 'studio' },
    ],
    edges: [{ id: 1, source: 1, target: 2, relationship: 'access' }],
    diagram: { positions: { 1: [0, 0], 2: [100, 0] } },
  });

function fileWith(toolkit: { id: string } | null, doc = rooms()): ProjectFileV2 {
  const r = newProjectFromDesign(doc, { ...fixtureIds(), name: 'Test', toolkit });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}
const okValue = <T,>(r: { ok: true; value: T } | { ok: false; issues: unknown }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
};

describe('settings.uploadedToolkit in the project file (additive)', () => {
  it('a file without it reads and writes unchanged (older project files)', () => {
    const text = serializeProjectFile(fileWith(null));
    expect(JSON.parse(text).settings).not.toHaveProperty('uploadedToolkit');
    expect(serializeProjectFile(okValue(readProjectFile(text)))).toBe(text);
  });
  it('round-trips byte for byte, text and base64 files alike', () => {
    const file: ProjectFileV2 = { ...fileWith({ id: house.name }), settings: { ...fileWith(null).settings, uploadedToolkit: house } };
    const text = serializeProjectFile(file);
    const back = okValue(readProjectFile(text));
    expect(back.settings.uploadedToolkit).toEqual(house);
    expect(serializeProjectFile(back)).toBe(text);
  });
  it('refuses a toolkit that is not the project toolkit, or without toolkit.ts', () => {
    const wrong = JSON.parse(serializeProjectFile(fileWith({ id: 'house' })));
    wrong.settings.uploadedToolkit = house;
    expect(readProjectFile(wrong).ok).toBe(false);
    const noToolkitTs = JSON.parse(serializeProjectFile(fileWith({ id: house.name })));
    noToolkitTs.settings.uploadedToolkit = { ...house, files: house.files.filter((f) => f.path !== 'toolkit.ts') };
    expect(readProjectFile(noToolkitTs).ok).toBe(false);
  });
});

describe('Download toolkit (.zip)', () => {
  it('gives <name>/toolkit.ts directly inside, and uploads again to the same files', async () => {
    const bytes = await toolkitZipBytes(house);
    const read = await readToolkitZip(bytes, `${house.name}.zip`, load);
    if (!read.ok) throw new Error(read.problems.join('\n'));
    expect(read.start.stored.name).toBe(house.name);
    expect(read.start.stored.files).toEqual(house.files);
    expect(await toolkitZipBytes(read.start.stored)).toEqual(bytes);
  });
});

describe('a new version of the uploaded toolkit', () => {
  it('replaces the stored files only for the same toolkit', () => {
    const project = openProject({ ...fileWith({ id: house.name }), settings: { ...fileWith(null).settings, uploadedToolkit: house } }, { kind: 'created', label: 't' });
    const v2 = { ...house, uploadedAt: '2026-11-27T12:00:00.000Z' };
    const next = setUploadedToolkit(project, v2);
    expect(next.ok && next.value.meta.settings.uploadedToolkit).toEqual(v2);
    expect(setUploadedToolkit(project, { ...v2, name: 'other' }).ok).toBe(false);
  });
});

describe('Add a toolkit… to a project without one', () => {
  it('an empty project gets the toolkit and its attributes', () => {
    const project = openProject(fileWith(null, design({ schemaVersion: 2, metadata: { name: 'Empty' }, nodes: [], edges: [] })), { kind: 'created', label: 't' });
    const plan = planToolkitAttach(houseToolkit, EMPTY_ATTRIBUTE_SCHEMA, [], []);
    if (!plan.ok) throw new Error(plan.problems.join('\n'));
    const next = okValue(attachToolkit(project, { toolkitId: 'house', attributes: plan.attributes }) as never);
    const file = okValue(projectFileOf(next as never));
    expect(file.toolkit).toEqual({ id: 'house' });
    expect((file.attributes as { schema: { nodes: { key: string }[] } }).schema.nodes.map((f) => f.key)).toEqual(['targetArea', 'priority']);
  });

  it('a project with rooms keeps every room, Function and value; the plan lists what changes', () => {
    const before = fileWith(null);
    const project = openProject(before, { kind: 'created', label: 't' });
    const mine = { nodes: [{ id: 'note', key: 'note', label: 'Note', kind: 'text' as const }], edges: [], functionDefaults: {} };
    const plan = planToolkitAttach(houseToolkit, mine, [rooms()], [{ id: 'studio', label: 'Studio' }]);
    if (!plan.ok) throw new Error(plan.problems.join('\n'));
    expect(plan.changes.join('\n')).toMatch(/Rooms that already use Kitchen now use the toolkit's Function/);
    expect(plan.changes.join('\n')).toMatch(/New attributes: Target area \(m²\), Priority/);
    const next = attachToolkit(project, { toolkitId: 'house', attributes: plan.attributes });
    if (!next.ok) throw new Error(next.message);
    const file = okValue(projectFileOf(next.value));
    expect(file.scenarios.map((s) => s.design)).toEqual(before.scenarios.map((s) => s.design));
    expect((file.attributes as { schema: { nodes: { key: string }[] } }).schema.nodes.map((f) => f.key)).toEqual(['note', 'targetArea', 'priority']);
    // Round trip: the saved file reads back with the toolkit.
    expect(okValue(readProjectFile(serializeProjectFile(file))).toolkit).toEqual({ id: 'house' });
    // Only none → toolkit.
    expect(attachToolkit(next.value, { toolkitId: 'house', attributes: plan.attributes }).ok).toBe(false);
  });

  it('is refused, in plain words, when an attribute key clashes or stored values do not fit', () => {
    const clash = { nodes: [{ id: 'targetArea', key: 'targetArea', label: 'Target area', kind: 'text' as const }], edges: [], functionDefaults: {} };
    const refused = planToolkitAttach(houseToolkit, clash, [rooms()]);
    expect(refused).toEqual({ ok: false, problems: [expect.stringMatching(/Your node attribute "Target area" \(targetArea\) is Text, but the toolkit's .* is Number/)] });
    const leftover = design({ schemaVersion: 2, metadata: { name: 'x' }, nodes: [{ id: 1, position: [0, 0, 0], function: 'room', custom: { priority: 'high' } }], edges: [] });
    const misfit = planToolkitAttach(houseToolkit, EMPTY_ATTRIBUTE_SCHEMA, [leftover]);
    expect(misfit).toEqual({ ok: false, problems: [expect.stringMatching(/Nodes 1 hold a value under "priority" that does not fit/)] });
  });

  it('an uploaded toolkit is stored with the project', async () => {
    const loaded = await load(house);
    if (!loaded.ok) throw new Error(loaded.problems.join('\n'));
    const project = openProject(fileWith(null), { kind: 'created', label: 't' });
    const plan = planToolkitAttach(loaded.toolkit, EMPTY_ATTRIBUTE_SCHEMA, [rooms()]);
    if (!plan.ok) throw new Error(plan.problems.join('\n'));
    const next = attachToolkit(project, { toolkitId: house.name, attributes: plan.attributes, uploaded: house });
    if (!next.ok) throw new Error(next.message);
    const file = okValue(projectFileOf(next.value));
    expect(file.toolkit).toEqual({ id: house.name });
    expect(okValue(readProjectFile(serializeProjectFile(file))).settings.uploadedToolkit).toEqual(house);
  });
});
