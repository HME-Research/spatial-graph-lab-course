import { describe, expect, it } from 'vitest';
import { createMemoryProjectStore, readProjectFile, type MemoryProjectStore, type ProjectFileV1 } from '@app/project';
import { DEFAULT_DISPLAY } from '@app/display/contracts';
import type { AppSavedCamera } from '@app/camera/savedCamera';
import { canUndo } from './history';
import { activeSession } from './projectStore';
import { fileOf } from './projectStore.fixtures';
import { createProjectController, type ProjectController, type Scheduler } from './projectStoreController';
import { createProjectCameraStore, createProjectDisplayStore } from './projectViewSettings';

const now: Scheduler = {
  set: (cb) => {
    cb();
    return 0;
  },
  clear: () => undefined,
};

let seq = 0;
function makeController(store: MemoryProjectStore = createMemoryProjectStore()): ProjectController {
  return createProjectController({
    store,
    scheduler: now,
    locks: null,
    now: () => '2026-11-16T12:00:00.000Z',
    newProjectId: () => `project-v${++seq}`,
    newScenarioId: () => `scenario-v${++seq}`,
  });
}

const created = { kind: 'created', label: 'test' } as const;

const camera = (id: string, name: string): AppSavedCamera => ({
  id,
  name,
  viewMode: 'architecture',
  pose: { position: [10, 8, 10], target: [1, 0, 1], up: [0, 1, 0], projection: 'perspective', fov: 50 },
});

function stored(store: MemoryProjectStore, id: string): ProjectFileV1 {
  const r = readProjectFile(store.records.get(id) as string);
  if (!r.ok) throw new Error('stored record unreadable');
  return r.value;
}

describe('cameras and display bound to the project file (I1)', () => {
  it('saved cameras are per scenario, persisted in the project file and not undoable', async () => {
    const store = createMemoryProjectStore();
    const c = makeController(store);
    await c.open(fileOf(), created);
    const cameras = createProjectCameraStore(c);
    const first = c.getState().project!.activeScenarioId;
    const created2 = c.createScenario({ from: 'current' });
    if (!created2.ok) throw new Error(created2.message);
    const second = created2.value;

    let notified = 0;
    const off = cameras.subscribe(() => notified++);
    expect(cameras.set(first, [camera('camera-1', 'Overview')])).toBe(true);
    off();
    expect(notified).toBeGreaterThan(0);
    expect(cameras.get(first).map((x) => x.name)).toEqual(['Overview']);
    expect(cameras.get(second)).toEqual([]);
    // Stable snapshot until changed (useSyncExternalStore).
    expect(cameras.get(first)).toBe(cameras.get(first));
    // Not an undo step in either scenario.
    expect(canUndo(activeSession(c.getState().project!).history)).toBe(false);

    await c.flush();
    const file = stored(store, c.getState().project!.meta.projectId);
    expect(file.scenarios.find((s) => s.id === first)!.cameras.map((x) => x.id)).toEqual(['camera-1']);
    expect(file.scenarios.find((s) => s.id === second)!.cameras).toEqual([]);
  });

  it('refuses invalid or duplicate cameras and unknown scenarios', async () => {
    const c = makeController();
    await c.open(fileOf(), created);
    const cameras = createProjectCameraStore(c);
    const id = c.getState().project!.activeScenarioId;
    expect(cameras.set(id, [camera('camera-1', 'A'), camera('camera-1', 'B')])).toBe(false);
    expect(cameras.set(id, [{ ...camera('camera-1', 'A'), viewMode: 'graph2d' } as unknown as AppSavedCamera])).toBe(false);
    expect(cameras.set('no-such-scenario', [camera('camera-1', 'A')])).toBe(false);
    expect(cameras.get(id)).toEqual([]);
  });

  it('display overrides are per scenario and defaults are project settings, both in the file', async () => {
    const store = createMemoryProjectStore();
    const c = makeController(store);
    await c.open(fileOf(), created);
    const display = createProjectDisplayStore(c);
    const first = c.getState().project!.activeScenarioId;
    const r = c.createScenario({ from: 'blank' });
    if (!r.ok) throw new Error(r.message);
    const second = r.value;

    expect(display.defaults()).toEqual(DEFAULT_DISPLAY);
    expect(display.setOverrides(first, { views: { architecture: { roofs: false } } })).toBe(true);
    expect(display.setDefaults({ ...DEFAULT_DISPLAY, lighting: 'soft' })).toBe(true);
    expect(display.setOverrides(first, { views: { architecture: { roofs: 'maybe' } } } as never)).toBe(false);
    expect(display.overrides(first)).toEqual({ views: { architecture: { roofs: false } } });
    expect(display.overrides(second)).toEqual({});
    expect(canUndo(activeSession(c.getState().project!).history)).toBe(false);

    await c.flush();
    const file = stored(store, c.getState().project!.meta.projectId);
    expect(file.settings.display.lighting).toBe('soft');
    expect(file.scenarios.find((s) => s.id === first)!.display).toEqual({ views: { architecture: { roofs: false } } });
  });

  it('never leaks between projects (reads follow the open project)', async () => {
    const c = makeController();
    await c.open(fileOf(), created);
    const cameras = createProjectCameraStore(c);
    const display = createProjectDisplayStore(c);
    const id = c.getState().project!.activeScenarioId;
    cameras.set(id, [camera('camera-1', 'Overview')]);
    display.setDefaults({ ...DEFAULT_DISPLAY, labels: false });
    await c.close();
    expect(cameras.get(id)).toEqual([]);
    expect(display.defaults()).toEqual(DEFAULT_DISPLAY);
    expect(cameras.set(id, [camera('camera-1', 'X')])).toBe(false);
    expect(display.setDefaults(DEFAULT_DISPLAY)).toBe(false);

    await c.open(fileOf(), created);
    const other = c.getState().project!.activeScenarioId;
    expect(cameras.get(other)).toEqual([]);
    expect(display.defaults()).toEqual(DEFAULT_DISPLAY);
  });
});
