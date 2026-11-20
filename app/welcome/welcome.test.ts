import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readDesign, serializeDesignV2 } from '@app/document';
import { activateToolkit } from '@app/extensions/activate';
import { discoverToolkits } from '@app/extensions/discover';
import { TOOLKIT_GLOBS } from '@app/extensions/toolkitGlobs';
import { createLocalStorageKeptMarks, createMemoryKeptMarks, createMemoryProjectStore, readProjectFile, serializeProjectFile } from '@app/project';
import { fileOf, twoRooms } from '@app/session/projectStore.fixtures';
import { createProjectController, showsWelcome } from '@app/session/projectStoreController';
import { ProjectControllerContext } from '@app/session/projectStoreContext';
import exampleJson from '../document/examples/house.json';
import { exportProject, NewProjectDialog, ProjectFiles } from './ProjectFiles';
import { Welcome, type WelcomeProps } from './Welcome';
import { createProject, openProjectText, tryExample, type WelcomeHost } from './welcomeFlow';
import { newProjectStart, projectFileName, recentRows } from './welcomeModel';

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

  it('Create project starts with an EMPTY graph; a toolkit without custom attributes adds none (no calculated either)', async () => {
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

  it('Create project with the House toolkit starts with its custom attributes (Target area, Priority) and an EMPTY graph', async () => {
    const source = discoverToolkits(TOOLKIT_GLOBS).toolkits.find((t) => t.id === 'house')!;
    const activation = await activateToolkit(source);
    if (activation.status !== 'active') throw new Error('toolkits/house did not activate');
    const { attributeBaseline, designs } = activation.toolkit;
    const houseDesign = designs.find((d) => d.id === 'house')!.result;
    if (!houseDesign.ok) throw new Error('designs/house.json is invalid');
    const h: WelcomeHost = {
      ...host(),
      // As the shell does: the toolkit's default design (for its Building settings) and its attributes.
      startingDesign: async () => ({ ok: true, doc: houseDesign.value, source: 'toolkits/house/designs/house.json', attributeSignature: attributeBaseline.signature, attributeSchema: attributeBaseline.schema }),
    };
    expect(houseDesign.value.nodes.length).toBeGreaterThan(0);
    expect((await createProject(h, 'My house', 'house')).ok).toBe(true);
    const p = h.controller.getState().project!;
    const design = p.scenarios[0]!.session.history.present.design;
    expect(design.nodes).toEqual([]);
    expect(design.edges).toEqual([]);
    const record = p.meta.attributes as { projectId: string; baseline: string; schema: { nodes: { key: string; label: string }[]; edges: unknown[]; functionDefaults: Record<string, Record<string, unknown>> } };
    expect(record.projectId).toBe('house');
    expect(record.baseline).toBe(attributeBaseline.signature);
    expect(record.schema.nodes.map((f) => [f.key, f.label])).toEqual([
      ['targetArea', 'Target area (m²)'],
      ['priority', 'Priority'],
    ]);
    expect(record.schema.edges).toEqual([]);
    // Each Function's defaults come along (e.g. Living: 36 m², priority 1).
    expect(Object.values(record.schema.functionDefaults.living ?? {}).sort()).toEqual([1, 36]);
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
    h.controller.command({ type: 'set-node-geometry', nodeId: 2, position: [2, 1, 0] });
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
    expect(read.ok && read.value.scenarios[1]!.design.nodes.find((n) => n.id === 2)!.position).toEqual([2, 1, 0]);
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

  it('offers a Guide button inside Welcome, so the Guide can be read before choosing', () => {
    const html = renderToStaticMarkup(createElement(Welcome, props()));
    expect(html).toMatch(/<button[^>]*class="sgl-guide-button sgl-welcome-guide"[^>]*>Guide<\/button>/);
    // Welcome only steps out of modal mode while the Guide is open.
    expect(html).not.toContain('sgl-welcome-scrim');
    expect(html).not.toContain('is-guide-open');
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

  it('New project asks for a toolkit whenever there is one (even only House), "No toolkit" preselected like Welcome', () => {
    expect(newProjectStart(1, null)).toEqual({ kind: 'ask', toolkitId: null });
    expect(newProjectStart(3, null)).toEqual({ kind: 'ask', toolkitId: null });
    // A default requested with ?toolkit= is preselected, as in Welcome.
    expect(newProjectStart(1, 'house')).toEqual({ kind: 'ask', toolkitId: 'house' });
    // No toolkit at all: nothing to choose, a project without a toolkit at once.
    expect(newProjectStart(0, null)).toEqual({ kind: 'create', toolkitId: null });
  });

  it('the New project dialog shows Welcome’s toolkit choice, on "No toolkit", with Cancel and Create project', () => {
    const house = [{ id: 'house', label: 'House' }];
    const html = renderToStaticMarkup(createElement(NewProjectDialog, { toolkits: house, toolkitId: null, onToolkit: noop, onCancel: noop, onCreate: noop }));
    expect(html).toContain('class="sgl-toolkit-picker"');
    expect(html).toMatch(/<option value="house">House<\/option><option value="" selected="">No toolkit<\/option>/);
    expect(html).toContain('>Cancel<');
    expect(html).toContain('>Create project<');
    // The same picker as Welcome's Create project.
    const welcome = renderToStaticMarkup(createElement(Welcome, props({ toolkits: house })));
    const picker = (markup: string) => markup.slice(markup.indexOf('<select'), markup.indexOf('</select>')).replace(/id="[^"]*"/, '');
    expect(picker(html)).toBe(picker(welcome));
    const chosen = renderToStaticMarkup(createElement(NewProjectDialog, { toolkits: house, toolkitId: 'house', onToolkit: noop, onCancel: noop, onCreate: noop }));
    expect(chosen).toMatch(/<option value="house" selected="">House<\/option>/);
  });
});
