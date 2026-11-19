import { describe, expect, it } from 'vitest';
import { readDesign, readDesignJson, serializeDesignV2, type DesignDocumentV2 } from '@app/document';
import { makeAttributeRecord, serializeAttributeRecord } from '@app/extensions/projectAttributes';
import twoStorey from '../document/test-designs/two-storey.json';
import {
  PROJECT_FILE_FORMAT,
  createIndexedDbProjectStore,
  createMemoryProjectStore,
  projectFileFromState,
  projectFromLegacyDesign,
  projectStateFromFile,
  readProjectFile,
  saveAsNewProject,
  serializeProjectFile,
  type ProjectFileV2,
  type ProjectIssueCode,
  type ProjectResult,
  type ProjectState,
} from './index';

// ── Fixtures ──────────────────────────────────────────────────────────────────────────────────

function design(raw: unknown): DesignDocumentV2 {
  const r = readDesign(raw);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value.doc;
}

/** Scenario A: two rooms side by side (a is 2 cells long), one access edge with a preferred face. */
const designA = () =>
  design({
    schemaVersion: 2,
    metadata: { name: 'Option A' },
    nodes: [
      { id: 1, position: [0, 0, 0], size: [2, 1, 1], function: 'gallery', custom: { area: 12 } },
      { id: 2, position: [2, 0, 0], function: 'studio' },
    ],
    edges: [{ id: 1, source: 1, target: 2, relationship: 'access' }],
    diagram: { positions: { 1: [0, 0], 2: [100, 0] } },
  });

/** Scenario B: different topology and geometry (three rooms, a tall room, an open edge). */
const designB = () =>
  design({
    schemaVersion: 2,
    metadata: { name: 'Option B' },
    nodes: [
      { id: 1, position: [0, 0, 0], function: 'gallery' },
      { id: 2, position: [0, 1, 0], size: [1, 1, 2], function: 'studio' },
      { id: 3, position: [5, 5, 0], function: 'gallery' },
    ],
    edges: [
      { id: 1, source: 1, target: 2, relationship: 'open' },
      { id: 2, source: 2, target: 3, relationship: 'access' },
    ],
    diagram: { positions: { 1: [0, 0], 2: [0, 100], 3: [200, 100] } },
  });

const attributeRecord = () =>
  JSON.parse(
    serializeAttributeRecord(
      makeAttributeRecord(
        'gallery',
        { nodes: [{ id: 'area', key: 'area', label: 'Area', kind: 'number', min: 0 }], edges: [], functionDefaults: {} },
        'files-signature',
        '2026-11-16T09:00:00.000Z',
      ),
    ),
  ) as unknown;

function twoScenarioState(): ProjectState {
  return {
    meta: {
      format: PROJECT_FILE_FORMAT,
      version: 2,
      projectId: 'p1',
      name: 'Museum',
      description: 'Two options',
      createdAt: '2026-11-16T09:00:00.000Z',
      updatedAt: '2026-11-16T10:00:00.000Z',
      toolkit: { id: 'gallery' },
      attributes: attributeRecord(),
      settings: { display: { labels: true, legend: false, roofs: true, colourPreset: 'neutral', lighting: 'soft' } },
      assets: { policy: 'none' },
    },
    activeScenarioId: 's2',
    scenarios: [
      {
        id: 's1',
        name: 'Option A',
        content: { design: designA(), facePreferences: { 1: { nodeId: 1, offset: [1, 0, 0], direction: '+x' } } },
        cameras: [
          { id: 'front', name: 'Front', viewMode: 'architecture', pose: { projection: 'perspective', position: [10, 8, 10], target: [0, 0, 0], up: [0, 1, 0], fov: 50 } },
        ],
        display: { roofs: false, views: { voxels: { labels: false } } },
      },
      {
        id: 's2',
        name: 'Option B',
        content: { design: designB(), facePreferences: {} },
        cameras: [
          { id: 'top', name: 'Top', viewMode: 'graph3d', pose: { projection: 'orthographic', position: [0, 20, 0], target: [0, 0, 0], up: [0, 0, -1], orthoHeight: 12 } },
        ],
        display: {},
      },
    ],
  };
}

function okValue<T>(r: ProjectResult<T>): T {
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

function codes<T>(r: ProjectResult<T>): ProjectIssueCode[] {
  expect(r.ok).toBe(false);
  return r.ok ? [] : r.issues.map((i) => i.code);
}

const validFile = () => okValue(projectFileFromState(twoScenarioState()));
const rawFile = () => JSON.parse(serializeProjectFile(validFile())) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// ── Project file ──────────────────────────────────────────────────────────────────────────────

describe('project file', () => {
  it('serializes canonically: deterministic, trailing newline, key order independent of input order', () => {
    const file = validFile();
    const text = serializeProjectFile(file);
    expect(text.endsWith('}\n')).toBe(true);
    expect(serializeProjectFile(okValue(readProjectFile(text)))).toBe(text);
    const shuffled = Object.fromEntries(Object.entries(JSON.parse(text) as Record<string, unknown>).reverse());
    expect(serializeProjectFile(okValue(readProjectFile(shuffled)))).toBe(text);
    expect(Object.keys(JSON.parse(text) as object)).toEqual([
      'format', 'version', 'projectId', 'name', 'description', 'createdAt', 'updatedAt', 'toolkit', 'attributes', 'activeScenarioId', 'scenarios', 'settings', 'assets',
    ]);
  });

  it('reads only format version 2: an older project file is refused, not migrated (P4)', () => {
    const current = JSON.parse(serializeProjectFile(validFile())) as Record<string, unknown>;
    const { toolkit, ...rest } = current;
    const v1 = { ...rest, version: 1, definition: toolkit === null ? null : { projectId: (toolkit as { id: string }).id } };
    expect(codes(readProjectFile(JSON.stringify(v1)))).toEqual(['unsupported-version']);
  });

  it('reads text and parsed values alike', () => {
    const text = serializeProjectFile(validFile());
    expect(okValue(readProjectFile(text))).toEqual(okValue(readProjectFile(JSON.parse(text))));
  });

  it('rejects a wrong format, version, JSON or envelope', () => {
    expect(codes(readProjectFile('{nope'))).toEqual(['invalid-json']);
    expect(codes(readProjectFile({ ...rawFile(), format: 'spatial-graph-lab/project-attributes' }))).toEqual(['wrong-format']);
    expect(codes(readProjectFile(designA()))).toEqual(['wrong-format']);
    expect(codes(readProjectFile({ ...rawFile(), version: 3 }))).toEqual(['unsupported-version']);
    expect(codes(readProjectFile({ ...rawFile(), extra: 1 }))).toContain('schema');
    const noAttrs = rawFile();
    delete noAttrs.attributes;
    expect(codes(readProjectFile(noAttrs))).toEqual(['schema']);
    expect(codes(readProjectFile({ ...rawFile(), scenarios: [] }))).toContain('schema');
    expect(codes(readProjectFile({ ...rawFile(), assets: { policy: 'embedded' } }))).toContain('schema');
    expect(codes(readProjectFile({ ...rawFile(), createdAt: 'yesterday' }))).toContain('schema');
  });

  it('rejects duplicate scenario ids and an unknown active scenario', () => {
    const dup = rawFile();
    dup.scenarios[1].id = 's1';
    dup.activeScenarioId = 's1';
    expect(codes(readProjectFile(dup))).toEqual(['duplicate-scenario-id']);
    expect(codes(readProjectFile({ ...rawFile(), activeScenarioId: 'nope' }))).toEqual(['unknown-active-scenario']);
  });

  it('rejects the whole file when any scenario design is invalid, with paths', () => {
    const bad = rawFile();
    bad.scenarios[1].design.edges[0].target = 99;
    const r = readProjectFile(bad);
    expect(codes(r)).toContain('invalid-design');
    expect(!r.ok && r.issues[0]!.path.slice(0, 3)).toEqual(['scenarios', 1, 'design']);
  });

  it('rejects a preference naming a room that is not one of the edge’s rooms, or on a non-access edge (final audit MINOR-1)', () => {
    const file = rawFile();
    const index = file.scenarios.findIndex((s: { design: { edges: unknown[] } }) => s.design.edges.length > 0);
    expect(index).toBeGreaterThanOrEqual(0);
    const edge = file.scenarios[index].design.edges[0];
    file.scenarios[index].facePreferences = { [edge.id]: { nodeId: 99, offset: [0, 0, 0], direction: '+x' } };
    const r = readProjectFile(file);
    expect(codes(r)).toEqual(['invalid-preference']);
    expect(!r.ok && r.issues[0]!.path).toEqual(['scenarios', index, 'facePreferences', String(edge.id), 'nodeId']);

    const open = rawFile();
    const openEdge = open.scenarios[index].design.edges[0];
    openEdge.relationship = 'open';
    open.scenarios[index].facePreferences = { [openEdge.id]: { nodeId: openEdge.source, offset: [0, 0, 0], direction: '+x' } };
    expect(codes(readProjectFile(open))).toEqual(['invalid-preference']);
  });

  it('rejects preferences of missing edges, duplicate camera ids, bad cameras and display', () => {
    const pref = rawFile();
    pref.scenarios[1].facePreferences = { 99: { nodeId: 1, offset: [0, 0, 0], direction: '+x' } };
    const r = readProjectFile(pref);
    expect(codes(r)).toEqual(['unknown-preference-edge']);
    expect(!r.ok && r.issues[0]!.path).toEqual(['scenarios', 1, 'facePreferences', '99']);

    const cams = rawFile();
    cams.scenarios[0].cameras.push(cams.scenarios[0].cameras[0]);
    expect(codes(readProjectFile(cams))).toEqual(['duplicate-camera-id']);
    const pose = rawFile();
    pose.scenarios[0].cameras[0].pose.up = [0, 0, 0];
    expect(codes(readProjectFile(pose))).toContain('schema');
    const display = rawFile();
    display.scenarios[0].display.lighting = 'neon';
    expect(codes(readProjectFile(display))).toContain('schema');
  });

  it('validates the attribute record with its own reader (and against the definition project)', () => {
    const other = rawFile();
    other.attributes.projectId = 'other-project';
    expect(codes(readProjectFile(other))).toEqual(['invalid-attributes']);
    const broken = rawFile();
    broken.attributes.schema = { nodes: 'x' };
    expect(codes(readProjectFile(broken))).toEqual(['invalid-attributes']);
    expect(okValue(readProjectFile({ ...rawFile(), attributes: null })).attributes).toBeNull();
    expect(okValue(readProjectFile({ ...rawFile(), toolkit: null })).attributes).toEqual(attributeRecord());
  });
});

describe('legacy design import', () => {
  const ids = () => {
    let n = 0;
    return { newId: () => 'proj-new', newScenarioId: () => `scn-${++n}`, now: () => '2026-11-16T12:00:00.000Z' };
  };

  it('wraps a design into one scenario "Scenario 1"', () => {
    const file = okValue(projectFromLegacyDesign(twoStorey, { ...ids(), toolkit: { id: 'gallery' } }));
    expect(file.projectId).toBe('proj-new');
    expect(file.name).toBe('Two-storey example');
    expect(file.scenarios).toHaveLength(1);
    expect(file.scenarios[0]).toMatchObject({ id: 'scn-1', name: 'Scenario 1', facePreferences: {}, cameras: [], display: {} });
    expect(file.scenarios[0]!.design.schemaVersion).toBe(2);
    expect(file.activeScenarioId).toBe('scn-1');
    expect(file.createdAt).toBe('2026-11-16T12:00:00.000Z');
    expect(file.toolkit).toEqual({ id: 'gallery' });
  });

  it('wraps a schema v2 design and keeps it exactly', () => {
    const file = okValue(projectFromLegacyDesign(JSON.parse(JSON.stringify(designB())), { ...ids(), name: 'Imported' }));
    expect(file.name).toBe('Imported');
    expect(file.scenarios[0]!.design).toEqual(designB());
  });

  it('refuses an invalid design or an invalid injected id', () => {
    expect(codes(projectFromLegacyDesign({ schemaVersion: 2, nodes: 'x' }, ids()))).toContain('invalid-design');
    expect(codes(projectFromLegacyDesign(twoStorey, { ...ids(), newId: () => 'not an id!' }))).toContain('schema');
  });
});

describe('Save As New Project', () => {
  const opts = () => {
    let n = 0;
    return { newId: () => 'p-copy', newScenarioId: () => `copy-${++n}`, now: () => '2026-11-17T08:00:00.000Z', name: 'Museum (copy)' };
  };

  it('gives a new project id and new scenario ids, maps the active scenario, keeps order and content', () => {
    const original = validFile();
    const copy = okValue(saveAsNewProject(original, opts()));
    expect(copy.projectId).toBe('p-copy');
    expect(copy.name).toBe('Museum (copy)');
    expect(copy.scenarios.map((s) => s.id)).toEqual(['copy-1', 'copy-2']);
    expect(copy.activeScenarioId).toBe('copy-2');
    expect(copy.createdAt).toBe('2026-11-17T08:00:00.000Z');
    expect(copy.scenarios.map(({ id: _id, ...rest }) => rest)).toEqual(original.scenarios.map(({ id: _id, ...rest }) => rest));
    expect(copy.attributes).toEqual(original.attributes);
    expect(copy.settings).toEqual(original.settings);
  });

  it('is independent: mutating the copy never changes the original (and vice versa)', () => {
    const original = validFile();
    const before = serializeProjectFile(original);
    const copy = okValue(saveAsNewProject(original, opts()));
    const copyBefore = serializeProjectFile(copy);
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const c = copy as any;
    c.scenarios[0].design.nodes[0].position[0] = 99;
    c.scenarios[0].design.nodes[0].custom.area = 1;
    c.scenarios[0].facePreferences[1].offset[0] = 0;
    c.scenarios[0].cameras[0].pose.position[0] = -1;
    c.scenarios[0].display.views.voxels.labels = true;
    c.attributes.schema.nodes[0].label = 'Changed';
    c.settings.display.labels = false;
    c.scenarios.pop();
    expect(serializeProjectFile(original)).toBe(before);
    const o = original as any;
    o.scenarios[1].design.nodes.pop();
    o.attributes.schema.nodes.pop();
    /* eslint-enable @typescript-eslint/no-explicit-any */
    expect(copy.scenarios).toHaveLength(1);
    expect(serializeProjectFile(copy)).not.toBe(copyBefore); // its own mutations only
    expect((copy.attributes as { schema: { nodes: unknown[] } }).schema.nodes).toHaveLength(1);
  });
});

// ── Storage (memory store; same policy as the IndexedDB adapter) ─────────────────────────────

describe('project store', () => {
  const clock = () => {
    let t = 0;
    return () => new Date(Date.UTC(2026, 10, 16, 12, 0, t++)).toISOString();
  };

  it('round-trips two scenarios with differing topology and geometry, shared attributes, preferences, cameras and display', async () => {
    const store = createMemoryProjectStore({ now: clock() });
    const state = twoScenarioState();
    const file = okValue(projectFileFromState(state));
    expect(await store.save(file)).toEqual({ status: 'saved', at: '2026-11-16T12:00:00.000Z' });
    const loaded = await store.load('p1');
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') return;
    const back = projectStateFromFile(loaded.file);
    expect(back).toEqual(state);
    expect(back.scenarios[0]!.content.design.nodes).toHaveLength(2);
    expect(back.scenarios[1]!.content.design.nodes).toHaveLength(3);
    expect(back.scenarios[1]!.content.design.nodes[1]!.size).toEqual([1, 1, 2]);
    expect(serializeProjectFile(loaded.file)).toBe(serializeProjectFile(file));
    expect(store.records.get('p1')).toBe(serializeProjectFile(file));
  });

  it('refuses to build or save an invalid project; the stored copy stays', async () => {
    const store = createMemoryProjectStore();
    await store.save(validFile());
    const stored = store.records.get('p1');
    const bad = { ...twoScenarioState(), activeScenarioId: 'nope' };
    expect(projectFileFromState(bad).ok).toBe(false);
    const forced = { ...validFile(), activeScenarioId: 'nope' };
    const r = await store.save(forced);
    expect(r).toMatchObject({ status: 'blocked', reason: 'error' });
    expect(store.records.get('p1')).toBe(stored);
  });

  it('a wrong-format file never replaces the current state', () => {
    let current: ProjectFileV2 = validFile();
    const before = serializeProjectFile(current);
    const attributeFile = serializeAttributeRecord(makeAttributeRecord('gallery', { nodes: [], edges: [], functionDefaults: {} }, 'x'));
    for (const text of [attributeFile, JSON.stringify(designA()), 'not json', JSON.stringify({ ...rawFile(), version: 9 })]) {
      const read = readProjectFile(text);
      if (read.ok) current = read.value;
      expect(read.ok).toBe(false);
    }
    expect(serializeProjectFile(current)).toBe(before);
  });

  it('quarantines a corrupt record, never overwrites it, and saves only after an explicit discard', async () => {
    const store = createMemoryProjectStore({ now: clock() });
    store.records.set('p1', '{"format": "spatial-graph-lab/project", broken');
    const loaded = await store.load('p1');
    expect(loaded).toMatchObject({ status: 'unreadable', quarantineKey: 'p1:unreadable:2026-11-16T12:00:00.000Z' });
    expect(await store.load('p1')).toMatchObject({ quarantineKey: 'p1:unreadable:2026-11-16T12:00:00.000Z' }); // no duplicate copy
    expect(store.quarantined.size).toBe(1);

    const saved = await store.save(validFile());
    expect(saved).toMatchObject({ status: 'blocked', reason: 'refused-unreadable' });
    expect(store.records.get('p1')).toBe('{"format": "spatial-graph-lab/project", broken');

    const list = await store.list();
    expect(list).toEqual([expect.objectContaining({ status: 'unreadable', projectId: 'p1' })]);

    expect(await store.discardUnreadable('p1')).toEqual({ status: 'discarded', quarantineKey: 'p1:unreadable:2026-11-16T12:00:00.000Z' });
    expect(store.records.has('p1')).toBe(false);
    expect(store.quarantined.get('p1:unreadable:2026-11-16T12:00:00.000Z')).toBe('{"format": "spatial-graph-lab/project", broken');
    expect((await store.save(validFile())).status).toBe('saved');
    expect(await store.discardUnreadable('p1')).toEqual({ status: 'not-unreadable' }); // a readable record is never discarded
    expect(store.records.has('p1')).toBe(true);
  });

  it('treats a non-text value, a newer version or a record of another id as unreadable; distinct copies get distinct keys', async () => {
    const store = createMemoryProjectStore({ now: () => '2026-11-16T12:00:00.000Z' });
    store.records.set('p1', { not: 'text' });
    expect(await store.load('p1')).toMatchObject({ status: 'unreadable', quarantineKey: 'p1:unreadable:2026-11-16T12:00:00.000Z' });
    store.records.set('p1', JSON.stringify({ ...rawFile(), version: 3 }));
    const second = await store.load('p1');
    expect(second).toMatchObject({ status: 'unreadable', quarantineKey: 'p1:unreadable:2026-11-16T12:00:00.000Z-2' });
    expect(second.status === 'unreadable' && second.issues[0]!.code).toBe('unsupported-version');
    store.records.set('other', serializeProjectFile(validFile()));
    expect(await store.load('other')).toMatchObject({ status: 'unreadable' });
    expect(store.quarantined.size).toBe(3);
  });

  it('reports a full quota as blocked/quota and keeps the previous copy', async () => {
    const small = serializeProjectFile(validFile()).length;
    const store = createMemoryProjectStore({ quotaBytes: small + 10 });
    expect((await store.save(validFile())).status).toBe('saved'); // replacing does not count the old copy
    expect((await store.save(validFile())).status).toBe('saved');
    const bigger: ProjectFileV2 = { ...validFile(), description: 'x'.repeat(100) };
    const r = await store.save(bigger);
    expect(r).toMatchObject({ status: 'blocked', reason: 'quota' });
    expect(store.records.get('p1')).toBe(serializeProjectFile(validFile()));
  });

  it('lists readable projects newest first, then unreadable ones', async () => {
    const store = createMemoryProjectStore();
    const at = (id: string, updatedAt: string): ProjectFileV2 => ({ ...validFile(), projectId: id, name: id, updatedAt });
    await store.save(at('old', '2026-01-01T00:00:00.000Z'));
    await store.save(at('new', '2026-11-16T00:00:00.000Z'));
    await store.save(at('mid', '2026-06-01T00:00:00.000Z'));
    store.records.set('bad', 'x');
    const list = await store.list();
    expect(list.map((s) => s.projectId)).toEqual(['new', 'mid', 'old', 'bad']);
    expect(list[0]).toMatchObject({ status: 'ok', name: 'new', scenarioCount: 2, toolkitId: 'gallery' });
  });

  it('reports missing IndexedDB as unavailable without throwing', async () => {
    const none = createIndexedDbProjectStore('sgl-test', { factory: null });
    expect(await none.save(validFile())).toMatchObject({ status: 'blocked', reason: 'unavailable' });
    expect(await none.load('p1')).toMatchObject({ status: 'unavailable' });
    expect(await none.list()).toEqual([]);
    expect(await none.discardUnreadable('p1')).toMatchObject({ status: 'blocked', reason: 'unavailable' });
    const throwing = createIndexedDbProjectStore('sgl-test', {
      factory: {
        open: () => {
          throw new Error('SecurityError: access denied');
        },
      },
    });
    expect(await throwing.save(validFile())).toMatchObject({ status: 'blocked', reason: 'unavailable' });
  });

  it('missing record loads as missing', async () => {
    expect(await createMemoryProjectStore().load('nothing')).toEqual({ status: 'missing' });
  });
});

describe('settings.calculatedFields (I1, optional)', () => {
  it('is absent by default and older files stay byte-identical', () => {
    const text = serializeProjectFile(validFile());
    expect(JSON.parse(text).settings).not.toHaveProperty('calculatedFields');
    expect(serializeProjectFile(okValue(readProjectFile(text)))).toBe(text);
  });

  it('round-trips metric ids (ids only, never values), keeping ids a newer catalogue may know', () => {
    const raw = rawFile();
    raw.settings = { ...raw.settings, calculatedFields: ['volume', 'area', 'future-metric'] };
    const file = okValue(readProjectFile(raw));
    expect(file.settings.calculatedFields).toEqual(['volume', 'area', 'future-metric']);
    const text = serializeProjectFile(file);
    expect(Object.keys(JSON.parse(text).settings)).toEqual(['display', 'calculatedFields']);
    expect(serializeProjectFile(okValue(readProjectFile(text)))).toBe(text);
  });

  it('rejects a malformed list before anything replaces state', () => {
    for (const bad of ['area', [1], [''], { area: true }]) {
      const raw = rawFile();
      raw.settings = { ...raw.settings, calculatedFields: bad };
      expect(codes(readProjectFile(raw))).toContain('schema');
    }
  });
});

describe('settings.uploadedAnalyses (P4 item I, optional)', () => {
  const upload = (id: string, source = "export default { kind: 'graph analysis source' };\n// ünïcode\n") => ({
    id,
    fileName: `${id}.ts`,
    source,
    addedAt: '2026-11-19T10:00:00.000Z',
  });

  it('is absent by default; stores source text (never compiled code) and round-trips byte for byte', () => {
    expect(JSON.parse(serializeProjectFile(validFile())).settings).not.toHaveProperty('uploadedAnalyses');
    const raw = rawFile();
    raw.settings = { ...raw.settings, uploadedAnalyses: [upload('upload-a'), upload('upload-b', 'export default 1;\n')] };
    const file = okValue(readProjectFile(raw));
    expect(file.settings.uploadedAnalyses).toEqual([upload('upload-a'), upload('upload-b', 'export default 1;\n')]);
    const text = serializeProjectFile(file);
    expect(Object.keys(JSON.parse(text).settings)).toEqual(['display', 'uploadedAnalyses']);
    expect(serializeProjectFile(okValue(readProjectFile(text)))).toBe(text);
  });

  it('keeps an upload that would no longer compile (the app lists it disabled; opening never fails for it)', () => {
    const raw = rawFile();
    raw.settings = { ...raw.settings, uploadedAnalyses: [upload('upload-a', 'this is not ( valid code')] };
    expect(okValue(readProjectFile(raw)).settings.uploadedAnalyses?.[0]?.source).toBe('this is not ( valid code');
  });

  it('rejects a malformed list before anything replaces state', () => {
    for (const bad of [
      'x',
      [{ id: 'A b', fileName: 'a.ts', source: '', addedAt: '2026-11-19T10:00:00.000Z' }],
      [upload('a'), upload('a')],
      [{ ...upload('a'), compiled: 'x' }],
      [{ ...upload('a'), source: 'x'.repeat(100_001) }],
      Array.from({ length: 21 }, (_, n) => upload(`u${n}`)),
    ]) {
      const raw = rawFile();
      raw.settings = { ...raw.settings, uploadedAnalyses: bad };
      expect(codes(readProjectFile(raw))).toContain('schema');
    }
  });
});

describe('numeric ids survive save → reopen (P4)', () => {
  /** Rooms 1, 2 and 5 (ids 3 and 4 were deleted earlier), edges 1 and 3; counters 9 and 4. */
  const gappedDesign = () =>
    design({
      schemaVersion: 2,
      metadata: { name: 'Gapped' },
      nextNodeId: 9,
      nextEdgeId: 4,
      nodes: [
        { id: 1, position: [0, 0, 0], size: [2, 1, 1], function: 'gallery', custom: { area: 12 } },
        { id: 2, position: [2, 0, 0], function: 'studio' },
        { id: 5, position: [2, 1, 0], function: 'gallery' },
      ],
      edges: [
        { id: 1, source: 1, target: 2, relationship: 'access' },
        { id: 3, source: 2, target: 5, relationship: 'open' },
      ],
      diagram: { positions: { 1: [0, 0], 2: [100, 0], 5: [100, 100] } },
    });

  it('serializeDesignV2 → readDesignJson is lossless for a design with a gap in its ids', () => {
    const doc = gappedDesign();
    expect(doc.nextNodeId).toBe(9);
    expect(doc.nextEdgeId).toBe(4);
    const text = serializeDesignV2(doc);
    const back = readDesignJson(text);
    if (!back.ok) throw new Error(JSON.stringify(back.issues));
    expect(back.value.doc).toEqual(doc);
    expect(back.value.doc.nodes.map((n) => n.id)).toEqual([1, 2, 5]);
    expect(back.value.doc.edges.map((e) => [e.id, e.source, e.target])).toEqual([[1, 1, 2], [3, 2, 5]]);
    expect(back.value.doc.nextNodeId).toBe(9);
    expect(back.value.doc.nextEdgeId).toBe(4);
    expect(back.value.doc.diagram?.positions?.[5]).toEqual([100, 100]);
    expect(serializeDesignV2(back.value.doc)).toBe(text);
  });

  it('serializeProjectFile → readProjectFile is lossless (ids, counters, positions, face preferences keyed by edge id)', () => {
    const state = twoScenarioState();
    const withGap: ProjectState = {
      ...state,
      scenarios: [
        {
          ...state.scenarios[0]!,
          content: { design: gappedDesign(), facePreferences: { 1: { nodeId: 1, offset: [1, 0, 0], direction: '+x' } } },
        },
        state.scenarios[1]!,
      ],
    };
    const file = okValue(projectFileFromState(withGap));
    const text = serializeProjectFile(file);
    const reopened = okValue(readProjectFile(text));
    expect(reopened).toEqual(file);
    expect(serializeProjectFile(reopened)).toBe(text);
    const scenario = reopened.scenarios[0]!;
    expect(scenario.design.nodes.map((n) => n.id)).toEqual([1, 2, 5]);
    expect(scenario.design.nextNodeId).toBe(9);
    expect(scenario.design.nextEdgeId).toBe(4);
    expect(scenario.design.diagram?.positions?.[5]).toEqual([100, 100]);
    expect(scenario.facePreferences).toEqual({ 1: { nodeId: 1, offset: [1, 0, 0], direction: '+x' } });
    expect(Object.keys(scenario.facePreferences)).toEqual(['1']);
    // The state rebuilt from the reopened file equals the original state.
    expect(projectStateFromFile(reopened)).toEqual(projectStateFromFile(file));
  });
});
