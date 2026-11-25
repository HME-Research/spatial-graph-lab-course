import { createElement, useContext } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NO_SELECTION } from '@core/viewer/selection';
import { createCameraBus } from '@core/viewer/three/camera';
import { DEFAULT_SCENE_OPTIONS, SceneOptionsContext, type SceneOptions } from '@core/viewer/three/sceneOptions';
import { ViewDisplayContext, type ViewDisplayValue } from '@app/views/three/viewDisplay';
import { WorkspaceServicesContext, type WorkspaceServices } from '@app/workspace/services';
import { DEFAULT_VIEWPORT_STATE, deriveViewports } from '@app/workspace/viewports';
import { DisplayPanel } from './DisplayPanel';
import { DisplayProvider, ViewportDisplay } from './DisplayProvider';
import { createDisplayStore, setViewField } from './displayStore';

const services: WorkspaceServices = {
  design: null,
  selection: NO_SELECTION,
  onSelect: () => {},
  viewports: deriveViewports(DEFAULT_VIEWPORT_STATE),
  cameraBus: createCameraBus(),
};

describe('DisplayPanel', () => {
  it('offers all five view modes and starts on the first shown view that has settings (Building)', () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceServicesContext.Provider, { value: services }, createElement(DisplayProvider, { scenarioId: 's' }, createElement(DisplayPanel))),
    );
    for (const mode of ['graph2d', 'graph3d', 'voxels', 'architecture', 'plan']) expect(html).toContain(`data-display-mode="${mode}"`);
    expect(html).toContain('data-display-settings="architecture"');
    for (const field of ['labels', 'legend', 'roofs', 'colourPreset', 'lighting']) expect(html).toContain(`data-display-field="${field}"`);
    expect(html).toContain('Appearance only');
    expect(html).toMatch(/<button type="button" disabled="">Reset Building to defaults<\/button>/);
  });
});

describe('ViewportDisplay', () => {
  it('resolves the scenario per-view override for its mode into canvas options and the view context', () => {
    const store = createDisplayStore({ scenarios: { s: setViewField(setViewField(undefined, 'architecture', 'roofs', false), 'architecture', 'lighting', 'soft') } });
    let options: SceneOptions = DEFAULT_SCENE_OPTIONS;
    let view: ViewDisplayValue | null = null;
    const Probe = () => {
      options = useContext(SceneOptionsContext);
      view = useContext(ViewDisplayContext);
      return null;
    };
    const mount = (mode: 'architecture' | 'graph3d') =>
      renderToStaticMarkup(createElement(DisplayProvider, { scenarioId: 's', store }, createElement(ViewportDisplay, { mode }, createElement(Probe))));
    mount('architecture');
    expect(options).toMatchObject({ lighting: 'soft', orthographic: true, navigationCube: true });
    expect(view!.display).toMatchObject({ mode: 'architecture', roofs: false });
    view!.set('roofs', true); // the in-view roof checkbox writes the same per-view override
    expect(store.overrides('s').views?.architecture).toEqual({ roofs: true, lighting: 'soft' });
    mount('graph3d');
    expect(options).toMatchObject({ lighting: 'default', orthographic: false });
  });
});
