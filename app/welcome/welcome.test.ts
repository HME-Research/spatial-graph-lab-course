import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readDesign, serializeDesignV2 } from '@app/document';
import { makeAttributeRecord, serializeAttributeRecord } from '@app/extensions/projectAttributes';
import { createLocalStorageKeptMarks, createMemoryKeptMarks, createMemoryProjectStore, readProjectFile, serializeProjectFile } from '@app/project';
import { attributeStorageKey } from '@app/session/projectAttributeStore';
import { readLegacyAttributeRecord } from './legacyAttributes';
import { fileOf, twoRooms } from '@app/session/projectStore.fixtures';
import { createProjectController, showsWelcome } from '@app/session/projectStoreController';
import { ProjectControllerContext } from '@app/session/projectStoreContext';
import exampleJson from '../document/examples/house.json';
import { exportProject, ProjectFiles } from './ProjectFiles';
import { Welcome, type WelcomeProps } from './Welcome';
import { createProject, openProjectText, tryExample, type WelcomeHost } from './welcomeFlow';
import { projectFileName, recentRows } from './welcomeModel';

const example = () => {
  const r = readDesign(exampleJson);
  if (!r.ok) throw new Error('example');
  return r.value.doc;
};

function host(store = createMemoryProjectStore(), kept = createMemoryKeptMarks()): WelcomeHost & { store: typeof store; kept: typeof kept } {
  const controller = createProjectController({ store, locks: null, debounceMs: 0, keptMarks: kept });
  return {
    store,
    kept,
    controller,
    defaultToolkitId: 'gallery',
    startingDesign: async (id) =>
      id === 'broken'
        ? { ok: false, message: 'the default design of broken is invalid' }
        : { ok: true, doc: twoRooms(), source: `toolkits/${id}/designs/x.json`, attributeSignature: 'files-sig' },
  };
}

const noop = () => undefined;
const props = (over: Partial<WelcomeProps> = {}): WelcomeProps => ({
  recent: { status: 'ready', items: [] },
  onCreate: noop,
  onOpenFile: noop,
  onTryExample: noop,
  onRestore: noop,
  onDiscardUnreadable: noop,
  ...over,
});

describe('Welcome flow', () => {
  it('creates a project from a toolkit’s starting design and stores it', async () => {
    const h = host();
    expect(showsWelcome(h.controller.getState())).toBe(true);
    const r = await createProject(h, '  My house ', 'starter');
    expect(r.ok).toBe(true);
    await h.controller.flush();
    const p = h.controller.getState().project!;
    expect(p.meta.name).toBe('My house');
    expect(p.meta.toolkit).toEqual({ id: 'starter' });
    expect(showsWelcome(h.controller.getState())).toBe(false);
    expect(h.store.records.size).toBe(1);
  });

  it('Create project starts with an EMPTY graph and only the required attributes (no custom, no calculated)', async () => {
    const h = host();
    expect((await createProject(h, 'Empty', 'gallery')).ok).toBe(true);
    const p = h.controller.getState().project!;
    expect(p.scenarios).toHaveLength(1);
    const design = p.scenarios[0]!.session.history.present.design;
    expect(design.nodes).toEqual([]);
    expect(design.edges).toEqual([]);
    expect(p.meta.attributes).toMatchObject({ projectId: 'gallery', baseline: 'files-sig', schema: { nodes: [], edges: [] } });
    expect(p.meta.settings.calculatedFields).toEqual([]);
  });

  it('refuses an empty name or a failing starting design without opening anything', async () => {
    const h = host();
    expect((await createProject(h, '  ', 'gallery')).ok).toBe(false);
    const bad = await createProject(h, 'x', 'broken');
    expect(bad.ok === false && bad.message).toMatch(/invalid/);
    expect(h.controller.getState().project).toBeNull();
  });

  it('Try Example opens a new project each time; only the last session is kept unless saved locally', async () => {
    const h = host();
    const a = await tryExample(h, example(), 'example.json');
    await h.controller.flush();
    const b = await tryExample(h, example(), 'example.json');
    await h.controller.flush();
    if (!a.ok || !b.ok) throw new Error('not opened');
    expect(a.projectId).not.toBe(b.projectId);
    let recent = await h.controller.listRecent();
    // a was never saved locally: b replaced it as the last session.
    expect(recent.status === 'ok' && recent.items.map((s) => s.projectId)).toEqual([b.projectId]);
    expect(recent.status === 'ok' && recent.unsaved).toEqual([b.projectId]);
    expect((await h.controller.saveLocally()).ok).toBe(true);
    expect(h.controller.getState().kept).toBe(true);
    const c = await tryExample(h, example(), 'example.json');
    await h.controller.flush();
    if (!c.ok) throw new Error('not opened');
    recent = await h.controller.listRecent();
    expect(recent.status === 'ok' && recent.items.map((s) => s.projectId).sort()).toEqual([b.projectId, c.projectId].sort());
    expect(recent.status === 'ok' && recent.unsaved).toEqual([c.projectId]);
    // Restoring the saved one keeps it saved, and the unsaved last session (c) is then replaced.
    expect((await h.controller.restore(b.projectId)).ok).toBe(true);
    expect(h.controller.getState().kept).toBe(true);
    recent = await h.controller.listRecent();
    expect(recent.status === 'ok' && recent.items.map((s) => s.projectId)).toEqual([b.projectId]);
  });

  it('a one-time reset clears earlier stored projects and marks, keeping only the last session', async () => {
    const store = createMemoryProjectStore();
    const oldMarks = createMemoryKeptMarks();
    const old = createProjectController({ store, locks: null, debounceMs: 0, keptMarks: oldMarks });
    const earlier = await old.open(fileOf(), { kind: 'opened-file', label: 'x' });
    await old.flush();
    if (!earlier.ok) throw new Error('not opened');
    expect((await old.saveLocally()).ok).toBe(true);
    const last = await old.open(fileOf(), { kind: 'opened-file', label: 'y' }, { discard: true });
    await old.flush();
    if (!last.ok) throw new Error('not opened');
    expect((await old.listRecent()).status === 'ok').toBe(true);
    // A browser where the reset has not run yet (marks carried over, including the saved one).
    const marks = createMemoryKeptMarks(false);
    marks.add(earlier.project.meta.projectId);
    const h = host(store, marks);
    const recent = await h.controller.listRecent();
    expect(recent.status === 'ok' && recent.items.map((s) => s.projectId)).toEqual([last.project.meta.projectId]);
    expect(recent.status === 'ok' && recent.unsaved).toEqual([last.project.meta.projectId]);
    expect(marks.kept.size).toBe(0);
    expect(marks.initialised()).toBe(true);
    // It runs once: a project saved locally afterwards stays.
    await tryExample(h, example(), 'example.json');
    expect((await h.controller.saveLocally()).ok).toBe(true);
    await h.controller.flush();
    const after = await h.controller.listRecent();
    expect(after.status === 'ok' && after.items).toHaveLength(1);
  });

  it('localStorage kept marks: clear removes every mark and the legacy marker only', () => {
    const data = new Map<string, string>([['sgl-kept:a', '1'], ['sgl-kept-initialised', '1'], ['sgl-ui:x', '1']]);
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      key: (i: number) => [...data.keys()][i] ?? null,
      get length() {
        return data.size;
      },
    };
    const marks = createLocalStorageKeptMarks(storage);
    expect(marks.initialised()).toBe(false);
    marks.add('b');
    marks.clear();
    expect(marks.has('a') || marks.has('b')).toBe(false);
    expect(data.has('sgl-kept-initialised')).toBe(false);
    expect(data.get('sgl-ui:x')).toBe('1');
    marks.setInitialised();
    expect(marks.initialised()).toBe(true);
  });

  it('Save as new project keeps the copy saved', async () => {
    const h = host();
    await tryExample(h, example(), 'example.json');
    const r = await h.controller.saveAs('Copy');
    expect(r.ok).toBe(true);
    expect(h.controller.getState().kept).toBe(true);
    expect(r.ok && h.kept.has(r.value.meta.projectId)).toBe(true);
  });

  it('imports a design file as a new project with one scenario', async () => {
    const h = host();
    const r = await openProjectText(h, serializeDesignV2(example()), 'house.json');
    expect(r.ok).toBe(true);
    const p = h.controller.getState().project!;
    expect(p.scenarios).toHaveLength(1);
    expect(p.origin.kind).toBe('imported-design');
    expect(p.meta.toolkit).toEqual({ id: 'gallery' });
  });

  it('Try Example opens the graph-only example without a toolkit; its Functions become project functions', async () => {
    const h = host();
    expect((await tryExample(h, example(), 'example.json')).ok).toBe(true);
    const p = h.controller.getState().project!;
    expect(p.meta.name).toBe('Example – graph only (no toolkit)');
    expect(p.meta.toolkit).toBeNull();
    expect(p.meta.settings.functions).toEqual([
      { id: 'entrance', label: 'Entrance' },
      { id: 'circulation', label: 'Circulation' },
      { id: 'living', label: 'Living' },
      { id: 'kitchen', label: 'Kitchen' },
      { id: 'bedroom', label: 'Bedroom' },
      { id: 'bath', label: 'Bath' },
    ]);
  });

  it('opens a project file with every scenario; invalid files keep the open project', async () => {
    const h = host();
    const file = fileOf();
    const text = serializeProjectFile({ ...file, scenarios: [...file.scenarios, { ...file.scenarios[0]!, id: 'scenario-b', name: 'B' }] });
    expect((await openProjectText(h, text, 'p.project.json')).ok).toBe(true);
    const opened = h.controller.getState().project!;
    expect(opened.scenarios.map((s) => s.name)).toEqual(['Scenario 1', 'B']);
    const bad = await openProjectText(h, '{"format":"spatial-graph-lab/project","version":9}', 'future.json');
    expect(bad.ok === false && bad.issues.map((i) => i.code)).toEqual(['unsupported-version']);
    expect(bad.ok === false && bad.message).toMatch(/future\.json/);
    expect(h.controller.getState().project).toBe(opened);
    expect((await openProjectText(h, serializeDesignV2(twoRooms()).slice(0, 20), 'cut.json')).ok).toBe(false);
    expect(h.controller.getState().project).toBe(opened);
  });

  it('export → import round trip keeps every scenario (as a separate copy in the same browser)', async () => {
    const h = host();
    await tryExample(h, twoRooms(), 'two.json');
    h.controller.createScenario({ from: 'current', name: 'Option B' });
    h.controller.command({ type: 'set-node-geometry', nodeId: 'b', grid: [2, 1, 0] });
    let text = '';
    expect(exportProject(h.controller, (t) => (text = t))).toBeNull();
    const original = h.controller.getState().project!;
    await h.controller.flush();
    const r = await openProjectText(h, text, 'round-trip.project.json');
    expect(r.ok).toBe(true);
    const reopened = h.controller.getState().project!;
    expect(reopened.meta.projectId).not.toBe(original.meta.projectId);
    expect(reopened.scenarios.map((s) => s.name)).toEqual(['Scenario 1', 'Option B']);
    const read = readProjectFile(text);
    expect(read.ok && read.value.scenarios[1]!.design.nodes.find((n) => n.id === 'b')!.grid).toEqual([2, 1, 0]);
  });

  it('a failed download does not mark the project exported', async () => {
    const h = host();
    await createProject(h, 'x', 'gallery');
    const message = exportProject(h.controller, () => {
      throw new Error('blocked by browser');
    });
    expect(message).toMatch(/blocked by browser/);
    expect(h.controller.getState().project!.exportedSignature).toBeNull();
  });
});

describe('legacy attribute seed (one-time, read-only)', () => {
  /** A localStorage stand-in that records every write attempt. */
  function legacyStorage(entries: Record<string, string>) {
    const data = new Map(Object.entries(entries));
    const writes: string[] = [];
    return {
      writes,
      data,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string) => void writes.push(`set ${k}`),
      removeItem: (k: string) => void writes.push(`remove ${k}`),
    };
  }
  const legacyText = (projectId: string) =>
    serializeAttributeRecord(
      makeAttributeRecord(projectId, { nodes: [{ id: 'cost', key: 'cost', label: 'Cost', kind: 'number' }], edges: [], nodeTypeDefaults: {} }, 'legacy-baseline'),
    );

  it('never seeds Create project (required attributes only) and never touches the legacy record', async () => {
    const storage = legacyStorage({ [attributeStorageKey('starter')]: legacyText('starter') });
    const h = { ...host(), legacyAttributes: storage };
    expect((await createProject(h, 'Not seeded', 'starter')).ok).toBe(true);
    const attrs = h.controller.getState().project!.meta.attributes as { projectId: string; schema: { nodes: { key: string }[] } };
    expect(attrs.projectId).toBe('starter');
    expect(attrs.schema.nodes).toEqual([]);
    expect(storage.writes).toEqual([]);
    expect(storage.data.get(attributeStorageKey('starter'))).toBe(legacyText('starter'));
  });

  it('seeds design-file imports, but never Try Example (no toolkit) or an opened project file', async () => {
    const storage = legacyStorage({ [attributeStorageKey('gallery')]: legacyText('gallery') });
    const h = { ...host(), legacyAttributes: storage };
    await tryExample(h, example(), 'example.json');
    expect(h.controller.getState().project!.meta.attributes).toBeNull();
    await openProjectText(h, serializeDesignV2(example()), 'house.json');
    expect(h.controller.getState().project!.meta.attributes).not.toBeNull();
    await openProjectText(h, serializeProjectFile(fileOf()), 'p.project.json');
    expect(h.controller.getState().project!.meta.attributes).toBeNull();
    expect(storage.writes).toEqual([]);
  });

  it('ignores an unreadable legacy record with a short notice', async () => {
    const storage = legacyStorage({ [attributeStorageKey('gallery')]: '{ broken' });
    const h = { ...host(), legacyAttributes: storage };
    expect((await openProjectText(h, serializeDesignV2(example()), 'house.json')).ok).toBe(true);
    expect(h.controller.getState().project!.meta.attributes).toBeNull();
    expect(h.controller.getState().notice).toMatch(/could not be read/);
    expect(readLegacyAttributeRecord(storage, 'gallery').kind).toBe('unreadable');
    expect(readLegacyAttributeRecord(null, 'gallery').kind).toBe('none');
    expect(storage.writes).toEqual([]);
  });
});

describe('leaving a project that could not be saved', () => {
  it('a flow reports needsConfirmation and only discards on the explicit retry', async () => {
    const h = host(createMemoryProjectStore({ quotaBytes: 10 }));
    await createProject(h, 'First', 'gallery');
    await h.controller.flush();
    const first = h.controller.getState().project!;
    const r = await tryExample(h, example(), 'example.json');
    expect(r.ok === false && r.needsConfirmation).toBe(true);
    expect(h.controller.getState().project).toBe(first);
    const again = await tryExample(h, example(), 'example.json', { discard: true });
    expect(again.ok).toBe(true);
  });
});

describe('Welcome screen', () => {
  it('says honestly when local storage is unavailable', () => {
    const html = renderToStaticMarkup(createElement(Welcome, props({ recent: { status: 'unavailable', message: 'IndexedDB is not available' } })));
    expect(html).toContain('cannot be listed');
    expect(html).toContain('IndexedDB is not available');
  });

  it('offers Create project, Open project, Try example and Recent projects', () => {
    const html = renderToStaticMarkup(createElement(Welcome, props()));
    expect(html).toContain('Welcome to Spatial Graph Lab');
    expect(html).toContain('Create project');
    expect(html).toContain('Open project');
    expect(html).toContain('type="file"');
    expect(html).toContain('Try example');
    expect(html).toContain('Recent projects');
    expect(html).toContain('No saved projects yet.');
    expect(html).toContain('Projects are saved in this browser');
    for (const old of ['design file', 'Open file', 'Try Example']) expect(html).not.toContain(old);
  });

  it('lists readable projects and unreadable records honestly', () => {
    const items = [
      { status: 'ok', projectId: 'p1', name: 'House', createdAt: '2026-11-16T10:00:00.000Z', updatedAt: '2026-11-16T11:00:00.000Z', scenarioCount: 2, toolkitId: 'gallery_kit' },
      { status: 'unreadable', projectId: 'p2', quarantineKey: 'p2:unreadable:x', issues: [{ path: [], code: 'invalid-json', message: 'file is not valid JSON' }] },
    ] as const;
    const html = renderToStaticMarkup(createElement(Welcome, props({ recent: { status: 'ready', items, unsaved: ['p1'] } })));
    expect(html).toContain('House');
    expect(html).toContain('2 scenarios');
    expect(html).toContain('Unreadable project');
    expect(html).toContain('file is not valid JSON');
    expect(html).toContain('Discard…');
    expect(html).toContain('last session · not saved');
    // No internal project ids or toolkit ids are shown.
    expect(html).not.toContain('>p2<');
    expect(html).not.toContain('gallery_kit');
    const rows = recentRows(items, () => 'when');
    expect(rows[0]).toMatchObject({ kind: 'ok', detail: '2 scenarios · edited when', unsaved: false });
    expect(rows[1]).toMatchObject({ kind: 'unreadable', quarantined: true });
  });

  it('Create project starts a project at once: no name or template form', () => {
    const html = renderToStaticMarkup(createElement(Welcome, props()));
    expect(html).toContain('Create project');
    expect(html).not.toContain('Project name');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('Course');
  });

  it('disables actions while busy and shows loading', () => {
    const html = renderToStaticMarkup(createElement(Welcome, props({ busy: 'Opening…', recent: { status: 'loading' } })));
    expect(html).toContain('Opening…');
    expect(html).toContain('Looking for saved projects');
    expect(html).toMatch(/disabled=""/);
  });
});

describe('Project Files', () => {
  it('renders each project action once, the information and the unsaved last-session state', async () => {
    const h = host();
    await createProject(h, 'x', 'gallery');
    const render = () =>
      renderToStaticMarkup(
        createElement(ProjectControllerContext.Provider, { value: h.controller }, createElement(ProjectFiles, { controller: h.controller, onNew: noop, onOpenFile: noop })),
      );
    let html = render();
    for (const label of ['New project', 'Open project', 'Export project', 'Save as new project']) {
      expect(html.split(`>${label}`).length, label).toBe(2);
    }
    for (const text of ['Last edited', '1 scenario', 'Description', 'Not saved locally', '>Save locally<']) expect(html).toContain(text);
    for (const old of ['Export design', 'Open JSON', 'Load example', 'Active project', 'Project Files']) expect(html).not.toContain(old);
    await h.controller.saveLocally();
    html = render();
    expect(html).not.toContain('>Save locally<');
    expect(html).toContain('Saved locally');
    expect(projectFileName('My House!')).toBe('my-house.project.json');
    expect(projectFileName('???')).toBe('project.project.json');
  });
});
