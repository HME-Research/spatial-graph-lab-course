import { describe, expect, it } from 'vitest';
import {
  createLocalStorageExportMarks,
  createMemoryExportMarks,
  createMemoryProjectStore,
  createRecordProjectStore,
  exportMarkOf,
  readProjectFile,
  serializeProjectFile,
  type MemoryProjectStore,
  type ProjectFileV1,
  type RecordBackend,
} from '@app/project';
import { currentDocument } from './documentSession';
import { canUndo } from './history';
import { activeDesign, activeSession, isExported, type OpenProject } from './projectStore';
import { fileOf } from './projectStore.fixtures';
import {
  BUSY_MESSAGE,
  CONFLICT_MESSAGE,
  createProjectController,
  hasUnsavedLocalChanges,
  showsWelcome,
  type LockManagerLike,
  type ProjectController,
  type Scheduler,
} from './projectStoreController';

// ── Harness ───────────────────────────────────────────────────────────────────────────────────

/** Timers run only when the test says so. */
function manualScheduler() {
  const queue = new Map<number, () => void>();
  let next = 0;
  const scheduler: Scheduler = {
    set: (cb) => {
      queue.set(++next, cb);
      return next;
    },
    clear: (h) => {
      queue.delete(h as number);
    },
  };
  return {
    scheduler,
    pending: () => queue.size,
    run() {
      const all = [...queue.values()];
      queue.clear();
      for (const cb of all) cb();
    },
  };
}

/** A real mutual-exclusion lock per name, like navigator.locks (shared by "tabs" in a test). */
function fakeLocks(): LockManagerLike & { log: string[] } {
  const tails = new Map<string, Promise<unknown>>();
  const log: string[] = [];
  return {
    log,
    request<T>(name: string, cb: () => Promise<T>) {
      const prev = tails.get(name) ?? Promise.resolve();
      const run = prev.then(() => {
        log.push(name);
        return cb();
      });
      tails.set(name, run.catch(() => undefined));
      return run;
    },
  };
}

let seq = 0;
const clock = () => `2026-11-16T12:${String(Math.floor(seq / 60) % 60).padStart(2, '0')}:${String(seq++ % 60).padStart(2, '0')}.000Z`;

function makeController(store = createMemoryProjectStore(), locks: LockManagerLike | null = fakeLocks()) {
  const timers = manualScheduler();
  const c = createProjectController({
    store,
    scheduler: timers.scheduler,
    locks,
    now: clock,
    newProjectId: () => `project-c${++seq}`,
    newScenarioId: () => `scenario-c${++seq}`,
  });
  return { c, store, timers };
}

const project = (c: ProjectController): OpenProject => {
  const p = c.getState().project;
  if (!p) throw new Error('no project');
  return p;
};

function move(c: ProjectController, nodeId: string, grid: [number, number, number]) {
  const r = c.command({ type: 'set-node-geometry', nodeId, grid });
  if (!r.ok) throw new Error(r.issues.map((i) => i.message).join('; '));
}
const gridOf = (c: ProjectController, nodeId: string) => activeDesign(project(c)).nodes.find((n) => n.id === nodeId)!.grid;

function stored(store: MemoryProjectStore, id: string): ProjectFileV1 {
  const r = readProjectFile(store.records.get(id) as string);
  if (!r.ok) throw new Error('stored record unreadable');
  return r.value;
}

const created = { kind: 'created', label: 'test' } as const;

// ── Welcome / startup ─────────────────────────────────────────────────────────────────────────

describe('startup and Welcome', () => {
  it('always starts without a project, even when projects are stored (no auto-resume)', async () => {
    const store = createMemoryProjectStore();
    const first = makeController(store).c;
    await first.open(fileOf(), created);
    await first.flush();
    expect(store.records.size).toBe(1);
    const second = makeController(store).c;
    expect(second.getState().project).toBeNull();
    expect(showsWelcome(second.getState())).toBe(true);
    const recent = await second.listRecent();
    expect(recent.status === 'ok' && recent.items.map((s) => s.status)).toEqual(['ok']);
  });

  it('says honestly when storage is unavailable instead of listing nothing', async () => {
    const none = makeController(createIndexedStoreWithoutDb()).c;
    const recent = await none.listRecent();
    expect(recent.status).toBe('unavailable');
    const empty = await makeController().c.listRecent();
    expect(empty).toEqual({ status: 'ok', items: [] });
  });

  it('restores a Recent project explicitly, without writing', async () => {
    const store = createMemoryProjectStore();
    const a = makeController(store).c;
    await a.open(fileOf(), created);
    move(a, 'c', [6, 7, 0]);
    await a.flush();
    const text = store.records.get(project(a).meta.projectId);
    const b = makeController(store).c;
    const r = await b.restore(project(a).meta.projectId);
    expect(r.ok).toBe(true);
    expect(gridOf(b, 'c')).toEqual([6, 7, 0]);
    expect(b.getState().save.local).toBe('saved');
    expect(canUndo(activeSession(project(b)).history)).toBe(false);
    await b.flush();
    expect(store.records.get(project(b).meta.projectId)).toBe(text);
    expect(showsWelcome(b.getState())).toBe(false);
    await b.close();
    expect(showsWelcome(b.getState())).toBe(true);
  });

  it('reports unreadable, missing and unavailable records honestly', async () => {
    const store = createMemoryProjectStore();
    store.records.set('project-bad', '{ corrupt');
    const { c } = makeController(store);
    const recent = await c.listRecent();
    expect(recent).toEqual({ status: 'ok', items: [expect.objectContaining({ status: 'unreadable', projectId: 'project-bad' })] });
    const r = await c.restore('project-bad');
    expect(r.ok === false && r.status).toBe('unreadable');
    expect(r.ok === false && r.message).toMatch(/cannot be read/);
    expect(store.records.get('project-bad')).toBe('{ corrupt');
    expect((await c.restore('project-none')).ok).toBe(false);
    expect(c.getState().project).toBeNull();
    // Explicit discard (quarantine copy kept).
    expect((await c.discardUnreadable('project-bad')).status).toBe('discarded');
    expect(store.records.has('project-bad')).toBe(false);
    expect([...store.quarantined.keys()].some((k) => k.startsWith('project-bad:unreadable:'))).toBe(true);

    const none = makeController(createIndexedStoreWithoutDb()).c;
    const u = await none.restore('x');
    expect(u.ok === false && u.status).toBe('unavailable');
  });
});

import { createIndexedDbProjectStore } from '@app/project';
const createIndexedStoreWithoutDb = () => createIndexedDbProjectStore('test', { factory: null }) as unknown as MemoryProjectStore;

// ── Autosave ──────────────────────────────────────────────────────────────────────────────────

describe('autosave', () => {
  it('stores a new project at once, then debounces edits into one write', async () => {
    const { c, store, timers } = makeController();
    await c.open(fileOf(), created);
    expect(c.getState().save.local).toBe('pending');
    timers.run();
    await c.flush();
    expect(c.getState().save.local).toBe('saved');
    const id = project(c).meta.projectId;
    const firstText = store.records.get(id);

    move(c, 'c', [6, 7, 0]);
    move(c, 'c', [6, 8, 0]);
    expect(c.getState().save.local).toBe('pending');
    expect(hasUnsavedLocalChanges(c.getState())).toBe(true);
    expect(timers.pending()).toBe(1);
    expect(store.records.get(id)).toBe(firstText);
    timers.run();
    await c.flush();
    expect(c.getState().save.local).toBe('saved');
    expect(hasUnsavedLocalChanges(c.getState())).toBe(false);
    expect(stored(store, id).scenarios[0]!.design.nodes.find((n) => n.id === 'c')!.grid).toEqual([6, 8, 0]);
  });

  it('stores every scenario, the active scenario and settings (not the histories)', async () => {
    const { c, store } = makeController();
    await c.open(fileOf(), created);
    move(c, 'c', [6, 7, 0]);
    const s2 = c.createScenario({ from: 'current', name: 'Option B' });
    if (!s2.ok) throw new Error(s2.message);
    move(c, 'b', [2, 1, 0]);
    c.setCameras(s2.value, [
      { id: 'cam', name: 'Front', viewMode: 'architecture', pose: { projection: 'perspective', position: [1, 2, 3], target: [0, 0, 0], up: [0, 1, 0], fov: 50 } },
    ]);
    await c.flush();
    const file = stored(store, project(c).meta.projectId);
    expect(file.scenarios.map((s) => s.name)).toEqual(['Scenario 1', 'Option B']);
    expect(file.activeScenarioId).toBe(s2.value);
    expect(file.scenarios[1]!.cameras).toHaveLength(1);
    expect(file.scenarios[0]!.design.nodes.find((n) => n.id === 'b')!.grid).toEqual([2, 0, 0]);
    expect(file.scenarios[1]!.design.nodes.find((n) => n.id === 'b')!.grid).toEqual([2, 1, 0]);
  });

  it('never shows a quota failure as saved, and recovers on the next successful write', async () => {
    const store = createMemoryProjectStore({ quotaBytes: 1_000_000 });
    const { c } = makeController(store);
    await c.open(fileOf(), created);
    await c.flush();
    expect(c.getState().save.local).toBe('saved');
    // Shrink the quota: the next write fails.
    const tiny = createMemoryProjectStore({ quotaBytes: 10 });
    const t = makeController(tiny).c;
    await t.open(fileOf(), created);
    await t.flush();
    const s = t.getState().save;
    expect(s.local).toBe('blocked');
    expect(s.local === 'blocked' && s.reason).toBe('quota');
    expect(hasUnsavedLocalChanges(t.getState())).toBe(true);
    // A further edit keeps the blocked state visible until a write succeeds.
    move(t, 'c', [6, 7, 0]);
    expect(t.getState().save.local).toBe('blocked');
  });

  it('reports a failing backend as blocked/error, then saves after it recovers', async () => {
    const records = new Map<string, unknown>();
    let failing = true;
    const backend: RecordBackend = {
      getProject: async (id) => records.get(id),
      allProjects: async () => [...records],
      putProject: async (id, text) => {
        if (failing) throw new Error('disk on fire');
        records.set(id, text);
      },
      deleteProject: async (id) => void records.delete(id),
      allQuarantine: async () => [],
      addQuarantine: async () => undefined,
    };
    const { c } = makeController(createRecordProjectStore(backend) as unknown as MemoryProjectStore);
    await c.open(fileOf(), created);
    await c.flush();
    const s = c.getState().save;
    expect(s.local === 'blocked' && s.reason).toBe('error');
    expect(s.local === 'blocked' && s.message).toMatch(/disk on fire/);
    failing = false;
    await c.retrySave();
    expect(c.getState().save.local).toBe('saved');
    expect(records.size).toBe(1);
  });

  it('never overwrites an unreadable stored record (refused-unreadable)', async () => {
    const { c, store } = makeController();
    await c.open(fileOf(), created);
    await c.flush();
    const id = project(c).meta.projectId;
    store.records.set(id, 'garbage');
    move(c, 'c', [6, 7, 0]);
    await c.flush();
    const s = c.getState().save;
    expect(s.local === 'blocked' && s.reason).toBe('refused-unreadable');
    expect(store.records.get(id)).toBe('garbage');
  });

  it('reports unavailable storage as blocked/unavailable', async () => {
    const { c } = makeController(createIndexedStoreWithoutDb());
    await c.open(fileOf(), created);
    await c.flush();
    const s = c.getState().save;
    expect(s.local === 'blocked' && s.reason).toBe('unavailable');
  });
});

// ── Two tabs ──────────────────────────────────────────────────────────────────────────────────

describe('two tabs on one project', () => {
  async function twoTabs(locks: LockManagerLike | null) {
    const store = createMemoryProjectStore();
    const one = makeController(store, locks).c;
    await one.open(fileOf(), created);
    await one.flush();
    const id = project(one).meta.projectId;
    const two = makeController(store, locks).c;
    await two.restore(id);
    return { store, one, two, id };
  }

  it('refuses to overwrite a newer copy saved by another tab (conflict), until explicitly overwritten', async () => {
    const locks = fakeLocks();
    const { store, one, two, id } = await twoTabs(locks);
    move(two, 'b', [2, 1, 0]);
    await two.flush();
    expect(two.getState().save.local).toBe('saved');
    // Tab one has not seen tab two's write.
    move(one, 'c', [6, 7, 0]);
    await one.flush();
    const s = one.getState().save;
    expect(s.local === 'blocked' && s.reason).toBe('conflict');
    expect(s.local === 'blocked' && s.message).toBe(CONFLICT_MESSAGE);
    expect(stored(store, id).scenarios[0]!.design.nodes.find((n) => n.id === 'b')!.grid).toEqual([2, 1, 0]);
    // Further edits do not write while in conflict.
    move(one, 'c', [6, 8, 0]);
    await one.flush();
    expect(stored(store, id).scenarios[0]!.design.nodes.find((n) => n.id === 'c')!.grid).toEqual([6, 6, 0]);
    // Explicit choice.
    await one.overwriteStored();
    expect(one.getState().save.local).toBe('saved');
    expect(stored(store, id).scenarios[0]!.design.nodes.find((n) => n.id === 'c')!.grid).toEqual([6, 8, 0]);
    expect(locks.log.every((n) => n === `sgl-project:${id}`)).toBe(true);
  });

  it('Save As from a conflicted tab keeps both versions', async () => {
    const { store, one, two, id } = await twoTabs(fakeLocks());
    move(two, 'b', [2, 1, 0]);
    await two.flush();
    move(one, 'c', [6, 7, 0]);
    await one.flush();
    const copy = await one.saveAs('Mine');
    expect(copy.ok).toBe(true);
    await one.flush();
    expect(one.getState().save.local).toBe('saved');
    const mine = stored(store, project(one).meta.projectId);
    expect(mine.name).toBe('Mine');
    expect(mine.scenarios[0]!.design.nodes.find((n) => n.id === 'c')!.grid).toEqual([6, 7, 0]);
    expect(stored(store, id).scenarios[0]!.design.nodes.find((n) => n.id === 'b')!.grid).toEqual([2, 1, 0]);
  });

  it('serialises concurrent writes of both tabs under the lock (the second detects the first)', async () => {
    const { one, two } = await twoTabs(fakeLocks());
    move(one, 'c', [6, 7, 0]);
    move(two, 'b', [2, 1, 0]);
    await Promise.all([one.flush(), two.flush()]);
    const states = [one.getState().save, two.getState().save].map((s) => (s.local === 'blocked' ? s.reason : s.local));
    expect(states.sort()).toEqual(['conflict', 'saved']);
  });
});

// ── Writes in flight (independent audit C1/C2/m1/m2/m3) ──────────────────────────────────────

/** A memory store whose `save` waits until the test releases it (a slow IndexedDB). */
function gatedStore() {
  const inner = createMemoryProjectStore();
  const gates: Array<() => void> = [];
  let gated = false;
  const store: MemoryProjectStore = {
    ...inner,
    save: async (file) => {
      if (gated) await new Promise<void>((r) => gates.push(r));
      return inner.save(file);
    },
  };
  return {
    store,
    gate: () => void (gated = true),
    release: async () => {
      gated = false;
      while (gates.length) gates.shift()!();
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('writes in flight', () => {
  it('close() writes changes made while a write was running before returning to Welcome', async () => {
    const g = gatedStore();
    const { c, timers } = makeController(g.store);
    await c.open(fileOf(), created);
    await c.flush();
    const id = project(c).meta.projectId;
    g.gate();
    move(c, 'c', [6, 7, 0]);
    timers.run();
    await tick();
    move(c, 'c', [6, 8, 0]); // during the write
    const closing = c.close();
    await g.release();
    expect(await closing).toBe(true);
    expect(stored(g.store, id).scenarios[0]!.design.nodes.find((n) => n.id === 'c')!.grid).toEqual([6, 8, 0]);
  });

  it('switching project still writes the previous project’s newest changes', async () => {
    const g = gatedStore();
    const { c, timers } = makeController(g.store);
    await c.open(fileOf(), created);
    await c.flush();
    const a = project(c).meta.projectId;
    g.gate();
    move(c, 'c', [6, 7, 0]);
    timers.run();
    await tick();
    move(c, 'c', [6, 9, 0]); // during the write
    const opening = c.open(fileOf(), created);
    await g.release();
    await opening;
    await c.flush();
    expect(stored(g.store, a).scenarios[0]!.design.nodes.find((n) => n.id === 'c')!.grid).toEqual([6, 9, 0]);
    // Restoring A afterwards sees the final copy and saves without a false conflict.
    await c.restore(a);
    move(c, 'b', [2, 1, 0]);
    await c.flush();
    expect(c.getState().save.local).toBe('saved');
  });

  it('close() refuses to drop changes that could not be stored unless discarded explicitly', async () => {
    const tiny = createMemoryProjectStore({ quotaBytes: 10 });
    const { c } = makeController(tiny);
    await c.open(fileOf(), created);
    expect(await c.close()).toBe(false);
    expect(c.getState().project).not.toBeNull();
    expect(c.getState().save.local).toBe('blocked');
    expect(await c.close({ discard: true })).toBe(true);
    expect(c.getState().project).toBeNull();
  });

  it('a write that becomes blocked while leaving keeps the project open and asks (audit repair 1)', async () => {
    const g = gatedStore();
    const { c, timers, store } = makeController(g.store);
    await c.open(fileOf(), created);
    await c.flush();
    const a = project(c).meta.projectId;
    g.gate();
    move(c, 'c', [6, 7, 0]);
    timers.run();
    await tick();
    store.records.set(a, 'garbage'); // the stored copy becomes unreadable before the write lands
    move(c, 'c', [6, 8, 0]);
    const opening = c.open(fileOf(), created);
    await g.release();
    const r = await opening;
    expect(r.ok === false && r.needsConfirmation).toBe(true);
    expect(project(c).meta.projectId).toBe(a);
    expect(gridOf(c, 'c')).toEqual([6, 8, 0]);
    expect(store.records.get(a)).toBe('garbage');
  });

  it('never drops blocked (quota) changes when another project is opened, restored or created; discard is explicit', async () => {
    const tiny = createMemoryProjectStore({ quotaBytes: 10 });
    const { c } = makeController(tiny);
    await c.open(fileOf(), created);
    await c.flush();
    expect(c.getState().save.local).toBe('blocked');
    expect(c.hasPendingWork()).toBe(true);
    const shown = project(c);
    const other = await c.open(fileOf(), created);
    expect(other.ok === false && other.needsConfirmation).toBe(true);
    expect(other.ok === false && other.message).toMatch(/could not be saved/);
    expect(project(c)).toBe(shown);
    const restored = await c.restore('project-anything');
    expect(restored.ok === false && restored.status).toBe('needs-confirmation');
    expect(project(c)).toBe(shown);
    const discarded = await c.open(fileOf(), created, { discard: true });
    expect(discarded.ok).toBe(true);
    expect(project(c)).not.toBe(shown);
  });

  it('a conflict-blocked project is not left silently either; Save As keeps its changes in the copy', async () => {
    const store = createMemoryProjectStore();
    const one = makeController(store).c;
    await one.open(fileOf(), created);
    await one.flush();
    const id = project(one).meta.projectId;
    const two = makeController(store).c;
    await two.restore(id);
    move(two, 'b', [2, 1, 0]);
    await two.flush();
    move(one, 'c', [6, 7, 0]);
    await one.flush();
    expect(one.getState().save.local).toBe('blocked');
    const r = await one.open(fileOf(), created);
    expect(r.ok === false && r.needsConfirmation).toBe(true);
    expect(await one.close()).toBe(false);
    const copy = await one.saveAs('Mine');
    expect(copy.ok).toBe(true);
    await one.flush();
    expect(gridOf(one, 'c')).toEqual([6, 7, 0]);
    expect(one.getState().save.local).toBe('saved');
    expect(one.hasPendingWork()).toBe(false);
  });

  it('opening a file with the id of the shown (not yet stored) project opens a separate copy, without a false conflict', async () => {
    const g = gatedStore();
    const { c } = makeController(g.store);
    const file = fileOf();
    g.gate();
    await c.open(file, created);
    const opening = c.open(file, { kind: 'opened-file', label: 'same.json' });
    await g.release();
    await opening;
    await c.flush();
    expect(project(c).meta.projectId).not.toBe(file.projectId);
    expect(c.getState().save.local).toBe('saved');
  });

  it('a failed Overwrite does not leave conflict detection switched off', async () => {
    const store = createMemoryProjectStore();
    const one = makeController(store).c;
    await one.open(fileOf(), created);
    await one.flush();
    const id = project(one).meta.projectId;
    const two = makeController(store).c;
    await two.restore(id);
    move(two, 'b', [2, 1, 0]);
    await two.flush();
    move(one, 'c', [6, 7, 0]);
    await one.flush();
    store.records.set(id, 'garbage');
    await one.overwriteStored();
    const s = one.getState().save;
    expect(s.local === 'blocked' && s.reason).toBe('refused-unreadable');
    // The record becomes readable again (another tab discards and saves): this tab must not overwrite it silently.
    store.records.delete(id);
    move(two, 'b', [2, 2, 0]);
    await two.retrySave();
    await two.flush();
    move(one, 'c', [6, 8, 0]);
    await one.retrySave();
    await one.flush();
    const after = one.getState().save;
    expect(after.local === 'blocked' && after.reason).toBe('conflict');
  });
});

// ── Isolation and files ───────────────────────────────────────────────────────────────────────

describe('cross-project isolation', () => {
  it('opening a file whose id is already stored opens a separate copy and leaves the stored project untouched', async () => {
    const { c, store } = makeController();
    const file = fileOf();
    await c.open(file, created);
    move(c, 'c', [6, 7, 0]);
    await c.flush();
    const before = store.records.get(file.projectId);
    const r = await c.open(file, { kind: 'opened-file', label: 'same.json' }, { exported: true });
    expect(r.ok).toBe(true);
    await c.flush();
    expect(project(c).meta.projectId).not.toBe(file.projectId);
    expect(c.getState().notice).toMatch(/separate copy/);
    expect(store.records.get(file.projectId)).toBe(before);
    expect(store.records.size).toBe(2);
  });

  it('switching projects writes the previous project’s pending changes to ITS record only', async () => {
    const { c, store } = makeController();
    await c.open(fileOf(), created);
    await c.flush();
    const a = project(c).meta.projectId;
    move(c, 'c', [6, 7, 0]);
    await c.open(fileOf(), created);
    const b = project(c).meta.projectId;
    move(c, 'b', [2, 1, 0]);
    await c.flush();
    // Let the previous project's write finish too.
    await new Promise((r) => setTimeout(r, 0));
    expect(stored(store, a).scenarios[0]!.design.nodes.find((n) => n.id === 'c')!.grid).toEqual([6, 7, 0]);
    expect(stored(store, a).scenarios[0]!.design.nodes.find((n) => n.id === 'b')!.grid).toEqual([2, 0, 0]);
    expect(stored(store, b).scenarios[0]!.design.nodes.find((n) => n.id === 'b')!.grid).toEqual([2, 1, 0]);
    expect(stored(store, b).scenarios[0]!.design.nodes.find((n) => n.id === 'c')!.grid).toEqual([6, 6, 0]);
  });

  it('Save As stores an independent project; later edits never reach the original', async () => {
    const { c, store } = makeController();
    await c.open(fileOf(), created);
    c.createScenario({ from: 'current', name: 'Option B' });
    await c.flush();
    const original = project(c).meta.projectId;
    const originalText = store.records.get(original);
    const copy = await c.saveAs('Copy');
    if (!copy.ok) throw new Error(copy.message);
    move(c, 'b', [2, 1, 0]);
    await c.flush();
    expect(store.records.get(original)).toBe(originalText);
    const copied = stored(store, project(c).meta.projectId);
    expect(copied.name).toBe('Copy');
    expect(copied.scenarios.map((s) => s.name)).toEqual(['Scenario 1', 'Option B']);
    expect(copied.scenarios.some((s) => stored(store, original).scenarios.some((o) => o.id === s.id))).toBe(false);
  });
});

describe('export and per-scenario undo through the controller', () => {
  it('exports all scenarios and marks exported without a local change', async () => {
    const { c } = makeController();
    await c.open(fileOf(), created);
    c.createScenario({ from: 'blank', name: 'Empty' });
    await c.flush();
    const changes = project(c).changes;
    const out = c.exportFile();
    if (!out.ok) throw new Error(out.message);
    expect(readProjectFile(out.value.text).ok).toBe(true);
    expect(out.value.file.scenarios).toHaveLength(2);
    c.markExported(out.value.signature);
    expect(project(c).changes).toBe(changes);
    expect(c.getState().save.local).toBe('saved');
    expect(serializeProjectFile(out.value.file)).toBe(out.value.text);
  });

  it('undo/redo act only on the active scenario', async () => {
    const { c } = makeController();
    await c.open(fileOf(), created);
    const first = project(c).activeScenarioId;
    move(c, 'c', [6, 7, 0]);
    const second = c.duplicateScenario(first);
    if (!second.ok) throw new Error(second.message);
    expect(c.undo()).toBe(false);
    move(c, 'b', [2, 1, 0]);
    c.switchScenario(first);
    expect(c.undo()).toBe(true);
    expect(gridOf(c, 'c')).toEqual([6, 6, 0]);
    expect(c.undo()).toBe(false);
    c.switchScenario(second.value);
    expect(gridOf(c, 'b')).toEqual([2, 1, 0]);
    expect(gridOf(c, 'c')).toEqual([6, 7, 0]);
    expect(c.undo()).toBe(true);
    expect(gridOf(c, 'b')).toEqual([2, 0, 0]);
    expect(c.redo()).toBe(true);
    expect(currentDocument(activeSession(project(c))).design.nodes.find((n) => n.id === 'b')!.grid).toEqual([2, 1, 0]);
  });

  it('refuses to delete the last scenario through the controller', async () => {
    const { c } = makeController();
    await c.open(fileOf(), created);
    const r = c.deleteScenario(project(c).activeScenarioId);
    expect(r.ok).toBe(false);
  });
});

// ── Audit repairs (I1): transitions are atomic w.r.t. edits; "exported" survives a restore ──────

/** A store whose `load(id)` waits while `id` is gated. */
function loadGatedStore() {
  const inner = createMemoryProjectStore();
  const waiting: Array<() => void> = [];
  let gatedId: string | null = null;
  const store: MemoryProjectStore = {
    ...inner,
    load: async (id) => {
      if (id === gatedId) await new Promise<void>((r) => waiting.push(r));
      return inner.load(id);
    },
  };
  return {
    store,
    gate: (id: string) => void (gatedId = id),
    release: async () => {
      gatedId = null;
      while (waiting.length) waiting.shift()!();
      await tick();
    },
  };
}

describe('leaving a project is atomic with respect to edits (I1 audit repair)', () => {
  it('an edit while restore() waits for store.load is refused, never accepted and lost (audit probe)', async () => {
    const g = loadGatedStore();
    const { c } = makeController(g.store);
    await c.open(fileOf(), created);
    await c.flush();
    const other = project(c).meta.projectId;
    await c.open(fileOf(), created);
    await c.flush();
    const left = project(c).meta.projectId;
    const before = serializeProjectFile(stored(g.store, left));

    g.gate(other);
    const restoring = c.restore(other);
    await tick();
    const r = c.command({ type: 'set-node-geometry', nodeId: 'c', grid: [6, 9, 0] });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.issues[0]!.message).toBe(BUSY_MESSAGE);
    expect(c.renameProject('Late').ok).toBe(false);
    expect(c.undo()).toBe(false);
    // A second transition meanwhile is refused too (nothing changes).
    expect(await c.restore(left)).toMatchObject({ ok: false, status: 'busy' });
    expect(await c.close()).toBe(false);
    await g.release();
    expect((await restoring).ok).toBe(true);
    expect(project(c).meta.projectId).toBe(other);
    await c.flush();
    // Either persisted for the left project or refused: here refused, and the left record is unchanged.
    expect(serializeProjectFile(stored(g.store, left))).toBe(before);
    expect(c.hasPendingWork()).toBe(false);
    // After the transition editing works again.
    move(c, 'c', [6, 7, 0]);
    expect(gridOf(c, 'c')).toEqual([6, 7, 0]);
  });

  it('an edit while open() checks the stored id is refused', async () => {
    const g = loadGatedStore();
    const { c } = makeController(g.store);
    await c.open(fileOf(), created);
    await c.flush();
    const file = fileOf();
    g.gate(file.projectId);
    const opening = c.open(file, created);
    await tick();
    expect(c.command({ type: 'set-node-geometry', nodeId: 'c', grid: [6, 9, 0] }).ok).toBe(false);
    await g.release();
    expect((await opening).ok).toBe(true);
    expect(gridOf(c, 'c')).toEqual([6, 6, 0]);
  });

  it('Save As copies the state at commit time; edits while it waits are refused', async () => {
    const g = gatedStore();
    const { c, timers } = makeController(g.store);
    await c.open(fileOf(), created);
    await c.flush();
    const original = project(c).meta.projectId;
    g.gate();
    move(c, 'c', [6, 7, 0]);
    timers.run();
    await tick(); // a write of the original is running
    const saving = c.saveAs('Copy');
    expect(c.command({ type: 'set-node-geometry', nodeId: 'c', grid: [6, 9, 0] }).ok).toBe(false);
    await g.release();
    const copy = await saving;
    if (!copy.ok) throw new Error(copy.message);
    expect(project(c).meta.projectId).not.toBe(original);
    expect(gridOf(c, 'c')).toEqual([6, 7, 0]);
    await c.flush();
    expect(stored(g.store, project(c).meta.projectId).scenarios[0]!.design.nodes.find((n) => n.id === 'c')!.grid).toEqual([6, 7, 0]);
  });
});

describe('"exported" is remembered beside the stored record (I1 audit repair)', () => {
  function controllerWith(store: MemoryProjectStore, marks: ReturnType<typeof createMemoryExportMarks>) {
    return createProjectController({
      store,
      scheduler: manualScheduler().scheduler,
      locks: null,
      now: clock,
      newProjectId: () => `project-e${++seq}`,
      newScenarioId: () => `scenario-e${++seq}`,
      exportMarks: marks,
    });
  }

  it('export → close → restore keeps isExported until the next edit; the exported file is unchanged', async () => {
    const store = createMemoryProjectStore();
    const marks = createMemoryExportMarks();
    const c = controllerWith(store, marks);
    await c.open(fileOf(), created);
    move(c, 'c', [6, 7, 0]);
    await c.flush();
    const id = project(c).meta.projectId;
    expect(isExported(project(c))).toBe(false);
    const out = c.exportFile();
    if (!out.ok) throw new Error(out.message);
    c.markExported(out.value.signature);
    expect(isExported(project(c))).toBe(true);
    // Nothing about exporting is in the file or the stored record.
    const again = c.exportFile();
    if (!again.ok) throw new Error(again.message);
    expect(again.value.text.replace(/"updatedAt": "[^"]*"/, '')).toBe(out.value.text.replace(/"updatedAt": "[^"]*"/, ''));
    expect(String(store.records.get(id))).not.toContain('export');
    expect(marks.marks.has(id)).toBe(true);
    expect(await c.close()).toBe(true);

    // A new controller (a reload) with the same browser storage.
    const d = controllerWith(store, marks);
    const r = await d.restore(id);
    expect(r.ok).toBe(true);
    expect(isExported(project(d))).toBe(true);
    move(d, 'b', [2, 1, 0]);
    expect(isExported(project(d))).toBe(false);
    await d.flush();
    await d.close();
    // The stale mark does not match the edited content.
    await d.restore(id);
    expect(isExported(project(d))).toBe(false);
  });

  it('a project opened from a file stays "exported" after a restore; Save As copies are not', async () => {
    const store = createMemoryProjectStore();
    const marks = createMemoryExportMarks();
    const c = controllerWith(store, marks);
    await c.open(fileOf(), { kind: 'opened-file', label: 'a.json' }, { exported: true });
    await c.flush();
    const id = project(c).meta.projectId;
    await c.close();
    await c.restore(id);
    expect(isExported(project(c))).toBe(true);
    const copy = await c.saveAs('Copy');
    if (!copy.ok) throw new Error(copy.message);
    expect(isExported(project(c))).toBe(false);
  });

  it('localStorage marks are best effort and never throw', () => {
    const failing = createLocalStorageExportMarks({
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    });
    expect(failing.get('p')).toBeNull();
    expect(() => failing.set('p', 'm')).not.toThrow();
    const map = new Map<string, string>();
    const ok = createLocalStorageExportMarks({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) });
    ok.set('p', exportMarkOf('x'));
    expect(ok.get('p')).toBe(exportMarkOf('x'));
    expect(exportMarkOf('x')).not.toBe(exportMarkOf('y'));
    expect([...map.keys()]).toEqual(['sgl-exported:p']);
  });
});
