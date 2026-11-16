import { describe, expect, it, vi } from 'vitest';
import {
  cameraPoseSchema,
  createCameraBus,
  savedCameraSchema,
  type CameraBusEvent,
  type CameraHandle,
  type CameraPose,
  type SavedCamera,
} from './camera';

const pose = (x = 10): CameraPose => ({ projection: 'perspective', position: [x, 8, 10], target: [0, 0, 0], up: [0, 1, 0], fov: 45 });

function fakeViewport(initial: CameraPose, options: Partial<Pick<CameraHandle, 'available' | 'accepts'>> = {}) {
  let current = initial;
  const handle: CameraHandle = {
    capture: () => current,
    apply: vi.fn((p: CameraPose) => {
      current = p;
    }),
    ...options,
  };
  return { handle, current: () => current };
}

describe('camera schemas', () => {
  it('accepts a perspective and an orthographic pose', () => {
    expect(cameraPoseSchema.safeParse(pose()).success).toBe(true);
    const ortho = { projection: 'orthographic', position: [0, 30, 0.01], target: [0, 0, 0], up: [0, 1, 0], orthoHeight: 24 };
    expect(cameraPoseSchema.safeParse(ortho).success).toBe(true);
  });

  it('rejects unknown keys, non-finite numbers, a zero up vector and position = target', () => {
    expect(cameraPoseSchema.safeParse({ ...pose(), zoom: 2 }).success).toBe(false);
    expect(cameraPoseSchema.safeParse({ ...pose(), position: [Infinity, 0, 0] }).success).toBe(false);
    expect(cameraPoseSchema.safeParse({ ...pose(), up: [0, 0, 0] }).success).toBe(false);
    expect(cameraPoseSchema.safeParse({ ...pose(), position: [0, 0, 0] }).success).toBe(false);
    expect(cameraPoseSchema.safeParse({ ...pose(), fov: 0 }).success).toBe(false);
    expect(cameraPoseSchema.safeParse({ ...pose(), projection: 'fisheye' }).success).toBe(false);
  });

  it('validates a saved camera strictly and its output fits SavedCamera', () => {
    const saved = { id: 'cam-1', name: 'Entrance', viewMode: 'architecture', pose: pose() };
    const parsed = savedCameraSchema.parse(saved);
    const typed: SavedCamera = parsed;
    expect(typed).toEqual(saved);
    expect(savedCameraSchema.safeParse({ ...saved, extra: true }).success).toBe(false);
    expect(savedCameraSchema.safeParse({ ...saved, id: '' }).success).toBe(false);
  });
});

describe('createCameraBus', () => {
  it('captures and applies through the registered handle', () => {
    const bus = createCameraBus();
    const vp = fakeViewport(pose(1));
    bus.register('viewport-1', vp.handle);
    expect(bus.capture('viewport-1')).toEqual(pose(1));
    expect(bus.apply('viewport-1', pose(2))).toBe('applied');
    expect(vp.current()).toEqual(pose(2));
    expect(bus.capture('viewport-1')).toEqual(pose(2));
    expect(bus.registered()).toEqual(['viewport-1']);
  });

  it('is unavailable after unregister', () => {
    const bus = createCameraBus();
    const vp = fakeViewport(pose());
    const unregister = bus.register('viewport-1', vp.handle);
    unregister();
    expect(bus.capture('viewport-1')).toBeNull();
    expect(bus.apply('viewport-1', pose(3))).toBe('unavailable');
    expect(vp.handle.apply).not.toHaveBeenCalled();
    expect(bus.registered()).toEqual([]);
  });

  it('never re-targets a request to another viewport', () => {
    const bus = createCameraBus();
    const other = fakeViewport(pose(5));
    bus.register('viewport-2', other.handle);
    expect(bus.apply('viewport-1', pose(9))).toBe('unavailable');
    expect(bus.capture('viewport-1')).toBeNull();
    expect(other.handle.apply).not.toHaveBeenCalled();
    expect(other.current()).toEqual(pose(5));
  });

  it('treats a hidden (unavailable) viewport and a refused pose as unavailable', () => {
    const bus = createCameraBus();
    let visible = false;
    const hidden = fakeViewport(pose(), { available: () => visible });
    bus.register('viewport-3', hidden.handle);
    expect(bus.capture('viewport-3')).toBeNull();
    expect(bus.apply('viewport-3', pose(4))).toBe('unavailable');
    visible = true;
    expect(bus.apply('viewport-3', pose(4))).toBe('applied');

    const perspectiveOnly = fakeViewport(pose(), { accepts: (p) => p.projection === 'perspective' });
    bus.register('viewport-4', perspectiveOnly.handle);
    const ortho: CameraPose = { projection: 'orthographic', position: [0, 9, 1], target: [0, 0, 0], up: [0, 1, 0], orthoHeight: 10 };
    expect(bus.apply('viewport-4', ortho)).toBe('unavailable');
    expect(perspectiveOnly.handle.apply).not.toHaveBeenCalled();
  });

  it('a stale unregister does not remove a newer registration under the same id', () => {
    const bus = createCameraBus();
    const first = fakeViewport(pose(1));
    const second = fakeViewport(pose(2));
    const unregisterFirst = bus.register('viewport-1', first.handle);
    bus.register('viewport-1', second.handle);
    unregisterFirst();
    expect(bus.capture('viewport-1')).toEqual(pose(2));
  });

  it('notifies subscribers of register, apply and unregister until they unsubscribe', () => {
    const bus = createCameraBus();
    const events: CameraBusEvent[] = [];
    const unsubscribe = bus.subscribe((e) => events.push(e));
    const unregister = bus.register('viewport-1', fakeViewport(pose()).handle);
    bus.apply('viewport-1', pose(2));
    bus.apply('viewport-9', pose(2)); // unavailable: no event
    unregister();
    unregister(); // idempotent
    unsubscribe();
    bus.register('viewport-2', fakeViewport(pose()).handle);
    expect(events).toEqual([
      { type: 'registered', viewportId: 'viewport-1' },
      { type: 'applied', viewportId: 'viewport-1' },
      { type: 'unregistered', viewportId: 'viewport-1' },
    ]);
  });
});
