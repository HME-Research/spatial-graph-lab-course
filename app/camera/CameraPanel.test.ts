import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NO_SELECTION } from '@core/viewer/selection';
import { createCameraBus } from '@core/viewer/three/camera';
import { WorkspaceServicesContext, type WorkspaceServices } from '@app/workspace/services';
import { DEFAULT_VIEWPORT_STATE, deriveViewports, setViewportLayout } from '@app/workspace/viewports';
import { CameraPanel } from './CameraPanel';
import { createMemorySavedCameraStore, SavedCamerasProvider } from './savedCameras';
import type { AppSavedCamera } from './savedCamera';

const services = (over: Partial<WorkspaceServices> = {}): WorkspaceServices => ({
  design: null,
  selection: NO_SELECTION,
  onSelect: () => {},
  viewports: deriveViewports(DEFAULT_VIEWPORT_STATE),
  cameraBus: createCameraBus(),
  ...over,
});

const camera: AppSavedCamera = {
  id: 'camera-1',
  name: 'Courtyard',
  viewMode: 'voxels',
  pose: { projection: 'orthographic', position: [0, 40, 0.01], target: [0, 0, 0], up: [0, 1, 0], orthoHeight: 20 },
};

const render = (scenarioId: string, value: WorkspaceServices = services()) => {
  const store = createMemorySavedCameraStore({ 's-a': [camera] });
  return renderToStaticMarkup(
    createElement(
      WorkspaceServicesContext.Provider,
      { value },
      createElement(SavedCamerasProvider, { scenarioId, store }, createElement(CameraPanel)),
    ),
  );
};

describe('CameraPanel', () => {
  it('lists the scenario’s saved cameras; Save and Recall wait for an explicit ready target', () => {
    const html = render('s-a');
    expect(html).toContain('aria-label="Camera target viewport"');
    expect(html).toContain('<option value="viewport-2">Viewport 2 — Building</option>');
    expect(html).toContain('Courtyard');
    expect(html).toContain('Voxels · orthographic');
    expect(html).toMatch(/<button type="button" disabled=""[^>]*>Save view<\/button>/);
    expect(html).toMatch(/<button type="button" disabled=""[^>]*>Recall<\/button>/);
    expect(html).toContain('>Rename<');
    expect(html).toContain('>Delete<');
  });

  it('cameras are kept per scenario', () => {
    const other = render('s-b');
    expect(other).toContain('No saved cameras in this scenario yet.');
    expect(other).not.toContain('Courtyard');
  });

  it('without any 3D viewport it explains how to get one and offers no target select', () => {
    const html = render('s-a', services({ viewports: deriveViewports(setViewportLayout(DEFAULT_VIEWPORT_STATE, 1)) }));
    expect(html).toContain('No 3D viewport is shown right now.');
    expect(html).not.toMatch(/<select\b/);
  });
});
