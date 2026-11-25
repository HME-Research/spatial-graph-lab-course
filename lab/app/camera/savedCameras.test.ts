import { describe, expect, it } from 'vitest';
import type { CameraPose } from '@core/viewer/three/camera';
import type { AppSavedCamera } from './savedCamera';
import {
  addSavedCamera,
  createMemorySavedCameraStore,
  deleteSavedCamera,
  newCameraId,
  nextCameraName,
  recallPlan,
  renameSavedCamera,
  supportsOrthographic,
} from './savedCameras';

const pose: CameraPose = { projection: 'perspective', position: [10, 8, 10], target: [0, 1.5, 0], up: [0, 1, 0], fov: 45 };
const ortho: CameraPose = { projection: 'orthographic', position: [0, 40, 0.004], target: [0, 1.5, 0], up: [0, 1, 0], orthoHeight: 24 };
const cam = (id: string, name: string, extra: Partial<AppSavedCamera> = {}): AppSavedCamera => ({ id, name, viewMode: 'architecture', pose, ...extra });

const ok = <T,>(r: { ok: true; cameras: T } | { ok: false; message: string }): T => {
  if (!r.ok) throw new Error(r.message);
  return r.cameras;
};

describe('saved camera list operations', () => {
  it('names and ids are generated, unique and independent of each other', () => {
    expect(nextCameraName([])).toBe('View 1');
    expect(nextCameraName([cam('a', 'View 1'), cam('b', 'view 2')])).toBe('View 3');
    expect(newCameraId([])).toBe('camera-1');
    expect(newCameraId([cam('camera-2', 'x'), cam('camera-3', 'y')])).toBe('camera-4');
  });

  it('save appends a validated camera; a blank name becomes "View n"', () => {
    const one = ok(addSavedCamera([], { name: '  ', viewMode: 'voxels', pose }));
    expect(one).toEqual([{ id: 'camera-1', name: 'View 1', viewMode: 'voxels', pose }]);
    const two = ok(addSavedCamera(one, { name: ' Entrance ', viewMode: 'architecture', pose: ortho }));
    expect(two.map((c) => c.name)).toEqual(['View 1', 'Entrance']);
    expect(two[1]!.pose.projection).toBe('orthographic');
    expect(one).toHaveLength(1); // input untouched
  });

  it('save refuses duplicate names and invalid poses (runtime validation, not just types)', () => {
    const list = [cam('camera-1', 'Entrance')];
    const dup = addSavedCamera(list, { name: 'entrance', viewMode: 'voxels', pose });
    expect(dup.ok).toBe(false);
    const bad = addSavedCamera([], { name: 'x', viewMode: 'voxels', pose: { ...pose, target: pose.position } });
    expect(bad.ok).toBe(false);
    const nan = addSavedCamera([], { name: 'x', viewMode: 'voxels', pose: { ...pose, position: [Number.NaN, 0, 0] } });
    expect(nan.ok).toBe(false);
    const flat = addSavedCamera([], { name: 'x', viewMode: 'graph2d' as never, pose });
    expect(flat.ok).toBe(false);
  });

  it('rename trims, refuses blank and duplicate names, keeps id and pose', () => {
    const list = [cam('camera-1', 'A'), cam('camera-2', 'B')];
    const renamed = ok(renameSavedCamera(list, 'camera-2', '  Courtyard '));
    expect(renamed[1]).toEqual({ ...list[1], name: 'Courtyard' });
    expect(renameSavedCamera(list, 'camera-2', '   ').ok).toBe(false);
    expect(renameSavedCamera(list, 'camera-2', 'a').ok).toBe(false);
    expect(ok(renameSavedCamera(list, 'camera-1', 'a'))[0]!.name).toBe('a'); // own name, other case
    expect(renameSavedCamera(list, 'missing', 'Z').ok).toBe(false);
  });

  it('delete removes exactly one camera', () => {
    const list = [cam('camera-1', 'A'), cam('camera-2', 'B')];
    expect(ok(deleteSavedCamera(list, 'camera-1')).map((c) => c.id)).toEqual(['camera-2']);
    expect(deleteSavedCamera(list, 'nope').ok).toBe(false);
  });
});

describe('recallPlan', () => {
  it('same 3D view: no note', () => {
    expect(recallPlan(cam('c', 'A'), 'architecture', true)).toEqual({ ok: true, note: null });
  });

  it('another 3D view: allowed, and says so', () => {
    const plan = recallPlan(cam('c', 'A'), 'voxels', true);
    expect(plan.ok).toBe(true);
    expect(plan.ok && plan.note).toMatch(/Saved in Building, applied to Voxels/);
  });

  it('a 2D view is never a target', () => {
    expect(recallPlan(cam('c', 'A'), 'graph2d', false).ok).toBe(false);
    expect(recallPlan(cam('c', 'A'), 'plan', false).ok).toBe(false);
  });

  it('orthographic cameras need Building or Voxels', () => {
    expect(supportsOrthographic('architecture')).toBe(true);
    expect(supportsOrthographic('voxels')).toBe(true);
    expect(supportsOrthographic('graph3d')).toBe(false);
    const plan = recallPlan(cam('c', 'Top', { pose: ortho }), 'graph3d', true);
    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.message).toMatch(/orthographic/);
    expect(recallPlan(cam('c', 'Top', { pose: ortho }), 'voxels', true).ok).toBe(true);
  });
});

describe('memory saved-camera store', () => {
  it('keeps cameras per scenario and notifies subscribers', () => {
    const store = createMemorySavedCameraStore();
    let calls = 0;
    const off = store.subscribe(() => calls++);
    expect(store.get('s1')).toEqual([]);
    expect(store.set('s1', [cam('camera-1', 'A')])).toBe(true);
    expect(store.get('s1')).toHaveLength(1);
    expect(store.get('s2')).toEqual([]);
    expect(store.get('s1')).toBe(store.get('s1')); // stable snapshot
    expect(calls).toBe(1);
    off();
    store.set('s2', []);
    expect(calls).toBe(1);
  });

  it('refuses invalid lists without changing anything', () => {
    const store = createMemorySavedCameraStore({ s1: [cam('camera-1', 'A')] });
    expect(store.set('s1', [cam('x', 'A'), cam('x', 'B')])).toBe(false);
    expect(store.set('s1', [{ ...cam('y', 'A'), pose: { ...pose, up: [0, 0, 0] } }])).toBe(false);
    expect(store.get('s1').map((c) => c.id)).toEqual(['camera-1']);
  });
});
