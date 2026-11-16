import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readDesign, serializeDesignV2 } from '@app/document/v2';
import { makeAttributeRecord, serializeAttributeRecord } from '@app/extensions/projectAttributes';
import { createMemoryProjectStore, readProjectFile, serializeProjectFile } from '@app/project';
import { attributeStorageKey } from '@app/session/projectAttributeStore';
import { readLegacyAttributeRecord } from './legacyAttributes';
import { fileOf, twoRooms } from '@app/session/projectStore.fixtures';
import { createProjectController, showsWelcome } from '@app/session/projectStoreController';
import { ProjectControllerContext } from '@app/session/projectStoreContext';
import exampleV1 from '../document/examples/two-storey-example.json';
import { exportProject, ProjectFiles } from './ProjectFiles';
import { Welcome, type WelcomeProps } from './Welcome';
import { createProject, openProjectText, tryExample, type WelcomeHost } from './welcomeFlow';
import { projectFileName, recentRows } from './welcomeModel';

const example = () => {
  const r = readDesign(exampleV1);
  if (!r.ok) throw new Error('example');
  return r.value.doc;
};

function host(store = createMemoryProjectStore()): WelcomeHost & { store: typeof store } {
  const controller = createProjectController({ store, locks: null, debounceMs: 0 });
  return {
    store,
    controller,
    defaultDefinitionId: 'example-gallery',
    startingDesign: async (id) => (id === 'broken' ? { ok: false, message: 'the default design of broken is invalid' } : { ok: true, doc: twoRooms(), source: `projects/${id}/designs/x.json` }),
  };
}

const noop = () => undefined;
const props = (over: Partial<WelcomeProps> = {}): WelcomeProps => ({
  definitions: [
    { id: 'example-gallery', label: 'Example gallery' },
    { id: 'starter-template', label: 'Starter template' },
  ],
  defaultDefinitionId: 'example-gallery',
  recent: { status: 'ready', items: [] },
  onCreate: noop,
  onOpenFile: noop,
  onTryExample: noop,
  onRestore: noop,
  onDiscardUnreadable: noop,
  ...over,
});

describe('Welcome flow', () => {
  it('creates a project from a code project’s starting design and stores it', async () => {
    const h = host();
    expect(showsWelcome(h.controller.getState())).toBe(true);
    const r = await createProject(h, '  My house ', 'starter-template');
    expect(r.ok).toBe(true);
    await h.controller.flush();
    const p = h.controller.getState().project!;
    expect(p.meta.name).toBe('My house');
    expect(p.meta.definition).toEqual({ projectId: 'starter-template' });
    expect(showsWelcome(h.controller.getState())).toBe(false);
    expect(h.store.records.size).toBe(1);
  });

  it('refuses an empty name or a failing starting design without opening anything', async () => {
    const h = host();
    expect((await createProject(h, '  ', 'example-gallery')).ok).toBe(false);
    const bad = await createProject(h, 'x', 'broken');
    expect(bad.ok === false && bad.message).toMatch(/invalid/);
    expect(h.controller.getState().project).toBeNull();
  });

  it('Try Example opens a new project each time (Recent restores earlier ones)', async () => {
    const h = host();
    const a = await tryExample(h, example(), 'example.json');
    await h.controller.flush();
    const b = await tryExample(h, example(), 'example.json');
    await h.controller.flush();
    expect(a.ok && b.ok && a.projectId !== b.projectId).toBe(true);
    const recent = await h.controller.listRecent();
    expect(recent.status === 'ok' && recent.items.length).toBe(2);
  });

  it('imports a legacy v1 design file as a new project with one scenario', async () => {
    const h = host();
    const r = await openProjectText(h, JSON.stringify(exampleV1), 'old-design.json');
    expect(r.ok).toBe(true);
    const p = h.controller.getState().project!;
    expect(p.scenarios).toHaveLength(1);
    expect(p.origin.kind).toBe('imported-design');
    expect(p.meta.definition).toEqual({ projectId: 'example-gallery' });
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
    await createProject(h, 'Round trip', 'example-gallery');
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
    await createProject(h, 'x', 'example-gallery');
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

  it('seeds a project created from a code project with that code project’s legacy record, never touching it', async () => {
    const storage = legacyStorage({ [attributeStorageKey('starter-template')]: legacyText('starter-template') });
    const h = { ...host(), legacyAttributes: storage };
    expect((await createProject(h, 'Seeded', 'starter-template')).ok).toBe(true);
    const attrs = h.controller.getState().project!.meta.attributes as { projectId: string; schema: { nodes: { key: string }[] } };
    expect(attrs.projectId).toBe('starter-template');
    expect(attrs.schema.nodes.map((n) => n.key)).toEqual(['cost']);
    expect(storage.writes).toEqual([]);
    expect(storage.data.get(attributeStorageKey('starter-template'))).toBe(legacyText('starter-template'));
    // Another code project without a legacy record starts from its files.
    expect((await createProject(h, 'Plain', 'example-gallery')).ok).toBe(true);
    expect(h.controller.getState().project!.meta.attributes).toBeNull();
  });

  it('seeds Try Example and design-file imports, but never an opened project file', async () => {
    const storage = legacyStorage({ [attributeStorageKey('example-gallery')]: legacyText('example-gallery') });
    const h = { ...host(), legacyAttributes: storage };
    await tryExample(h, example(), 'example.json');
    expect(h.controller.getState().project!.meta.attributes).not.toBeNull();
    await openProjectText(h, JSON.stringify(exampleV1), 'old.json');
    expect(h.controller.getState().project!.meta.attributes).not.toBeNull();
    await openProjectText(h, serializeProjectFile(fileOf()), 'p.project.json');
    expect(h.controller.getState().project!.meta.attributes).toBeNull();
    expect(storage.writes).toEqual([]);
  });

  it('ignores an unreadable legacy record with a short notice', async () => {
    const storage = legacyStorage({ [attributeStorageKey('example-gallery')]: '{ broken' });
    const h = { ...host(), legacyAttributes: storage };
    expect((await createProject(h, 'x', 'example-gallery')).ok).toBe(true);
    expect(h.controller.getState().project!.meta.attributes).toBeNull();
    expect(h.controller.getState().notice).toMatch(/could not be read/);
    expect(readLegacyAttributeRecord(storage, 'example-gallery').kind).toBe('unreadable');
    expect(readLegacyAttributeRecord(null, 'example-gallery').kind).toBe('none');
    expect(storage.writes).toEqual([]);
  });
});

describe('leaving a project that could not be saved', () => {
  it('a flow reports needsConfirmation and only discards on the explicit retry', async () => {
    const h = host(createMemoryProjectStore({ quotaBytes: 10 }));
    await createProject(h, 'First', 'example-gallery');
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

  it('offers Create, Open, Try Example and Recent', () => {
    const html = renderToStaticMarkup(createElement(Welcome, props()));
    expect(html).toContain('Create project');
    expect(html).toContain('Open file…');
    expect(html).toContain('type="file"');
    expect(html).toContain('Try Example');
    expect(html).toContain('Recent local projects');
    expect(html).toContain('No projects are saved in this browser yet.');
  });

  it('lists readable projects and unreadable records honestly', () => {
    const items = [
      { status: 'ok', projectId: 'p1', name: 'House', createdAt: '2026-11-16T10:00:00.000Z', updatedAt: '2026-11-16T11:00:00.000Z', scenarioCount: 2, definitionId: 'example-gallery' },
      { status: 'unreadable', projectId: 'p2', quarantineKey: 'p2:unreadable:x', issues: [{ path: [], code: 'invalid-json', message: 'file is not valid JSON' }] },
    ] as const;
    const html = renderToStaticMarkup(createElement(Welcome, props({ recent: { status: 'ready', items } })));
    expect(html).toContain('House');
    expect(html).toContain('2 scenarios');
    expect(html).toContain('Unreadable project');
    expect(html).toContain('file is not valid JSON');
    expect(html).toContain('Discard…');
    const rows = recentRows(items, () => 'when');
    expect(rows[0]).toMatchObject({ kind: 'ok', detail: '2 scenarios · edited when · example-gallery' });
    expect(rows[1]).toMatchObject({ kind: 'unreadable', quarantined: true });
  });

  it('shows the create form with the code-project choice', () => {
    const html = renderToStaticMarkup(createElement(Welcome, props({ startWith: 'create' })));
    expect(html).toContain('Project name');
    expect(html).toContain('Starter template');
  });

  it('disables actions while busy and shows loading', () => {
    const html = renderToStaticMarkup(createElement(Welcome, props({ busy: 'Opening…', recent: { status: 'loading' } })));
    expect(html).toContain('Opening…');
    expect(html).toContain('Looking for projects');
    expect(html).toMatch(/disabled=""/);
  });
});

describe('Project Files', () => {
  it('renders New, Open, Export Project and Save As New Project', async () => {
    const h = host();
    await createProject(h, 'x', 'example-gallery');
    const html = renderToStaticMarkup(
      createElement(ProjectControllerContext.Provider, { value: h.controller }, createElement(ProjectFiles, { controller: h.controller, onNew: noop, onOpenFile: noop })),
    );
    for (const label of ['New', 'Open…', 'Export Project', 'Save As New Project']) expect(html).toContain(label);
    expect(projectFileName('My House!')).toBe('my-house.project.json');
    expect(projectFileName('???')).toBe('project.project.json');
  });
});
