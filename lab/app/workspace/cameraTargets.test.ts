import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { useViewportCamera, ViewportCameraContext } from '@app/views/viewportCamera';
import { createCameraBus, type CameraHandle, type CameraPose } from '@core/viewer/three/camera';
import { cameraTargetLabel, cameraTargets, cameraTargetStatus } from './cameraTargets';
import { DEFAULT_VIEWPORT_STATE, deriveViewports, setViewportLayout, setViewportMode, toggleMaximise, type ViewportState } from './viewports';

const four: ViewportState = { layout: 4, modes: ['graph2d', 'architecture', 'graph3d', 'voxels'], maximised: null };
const ids = (s: ViewportState) => cameraTargets(deriveViewports(s)).map((v) => v.id);

describe('camera targets', () => {
  it('lists only visible 3D viewports, in order, labelled "Viewport N — <view>"', () => {
    expect(ids(DEFAULT_VIEWPORT_STATE)).toEqual(['viewport-2']);
    expect(ids(four)).toEqual(['viewport-2', 'viewport-3', 'viewport-4']);
    expect(cameraTargets(deriveViewports(four)).map(cameraTargetLabel)).toEqual([
      'Viewport 2 — Building',
      'Viewport 3 — Graph 3D',
      'Viewport 4 — Voxels',
    ]);
    // Maximised: only that viewport; hidden ones are not targets.
    expect(ids(toggleMaximise(four, 2))).toEqual(['viewport-3']);
    expect(ids(toggleMaximise(four, 0))).toEqual([]);
  });

  it('reports none / starting / ready for a chosen visible target', () => {
    const vps = deriveViewports(four);
    expect(cameraTargetStatus(vps, null, [])).toEqual({ kind: 'none' });
    expect(cameraTargetStatus(vps, 'viewport-3', []).kind).toBe('waiting');
    const ready = cameraTargetStatus(vps, 'viewport-3', ['viewport-2', 'viewport-3']);
    expect(ready).toMatchObject({ kind: 'ready', message: 'Viewport 3 — Graph 3D is ready' });
  });

  it('keeps a target that disappeared and reports it unavailable, never another viewport', () => {
    const registered = ['viewport-2', 'viewport-3', 'viewport-4'];
    const cases: ViewportState[] = [
      toggleMaximise(four, 1), // hidden by a maximise (still mounted and registered)
      setViewportLayout(four, 2), // outside the layout
      setViewportMode(four, 2, 'plan'), // switched to a 2D view
    ];
    for (const state of cases) {
      const status = cameraTargetStatus(deriveViewports(state), 'viewport-3', registered);
      expect(status).toEqual({ kind: 'unavailable', id: 'viewport-3', message: 'Viewport 3 is not available' });
    }
  });
});

describe('camera bus with viewports', () => {
  const pose: CameraPose = { projection: 'perspective', position: [5, 5, 5], target: [0, 0, 0], up: [0, 1, 0], fov: 45 };

  it('a hidden viewport answers unavailable and the request is not re-targeted', () => {
    const bus = createCameraBus();
    const applied: string[] = [];
    let hidden = false;
    const handle = (id: string, available?: () => boolean): CameraHandle => ({
      capture: () => pose,
      apply: () => void applied.push(id),
      ...(available && { available }),
    });
    bus.register('viewport-2', handle('viewport-2', () => !hidden));
    bus.register('viewport-3', handle('viewport-3'));
    expect(bus.apply('viewport-2', pose)).toBe('applied');
    hidden = true;
    expect(bus.capture('viewport-2')).toBeNull();
    expect(bus.apply('viewport-2', pose)).toBe('unavailable');
    expect(bus.apply('viewport-1', pose)).toBe('unavailable');
    expect(applied).toEqual(['viewport-2']);
  });

  it('views read their viewport id and the bus from ViewportCameraContext; nothing outside a viewport', () => {
    const bus = createCameraBus();
    let seen: unknown = 'unset';
    const Probe = () => {
      seen = useViewportCamera();
      return null;
    };
    renderToStaticMarkup(createElement(Probe));
    expect(seen).toEqual({});
    renderToStaticMarkup(createElement(ViewportCameraContext.Provider, { value: { viewportId: 'viewport-2', cameraBus: bus } }, createElement(Probe)));
    expect(seen).toEqual({ viewportId: 'viewport-2', cameraBus: bus });
  });
});
