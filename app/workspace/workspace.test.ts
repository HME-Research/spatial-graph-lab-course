import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VIEW_MODES } from '@app/views/contracts';
import { CAMERA_VIEW_MODES } from '@app/camera/savedCamera';
import { DISPLAY_FIELD_VIEWS, DISPLAY_VIEW_MODES } from '@app/display/contracts';
import { PANEL_FIELDS } from '@app/display/displayStore';
import { cameraTargets } from './cameraTargets';
import { VIEW_COMPONENTS } from '@app/views/registry';
import { VIEW_CAPTIONS, VIEW_DESCRIPTIONS, VIEW_LABELS } from '@app/ui';
import { NO_SELECTION } from '@core/viewer/selection';
import { createCameraBus } from '@core/viewer/three/camera';
import { DESTINATIONS } from './destinations';
import { DESTINATION_PANELS, SLOT_DESTINATIONS } from './panelSlots';
import {
  clampLeftWidth,
  initialLeftCollapsed,
  initialRightPane,
  keyboardResize,
  LEFT_WIDTH_DEFAULT,
  LEFT_WIDTH_MAX,
  LEFT_WIDTH_MIN,
  PANE_STORAGE_KEYS,
  readFlag,
  readLeftWidth,
  rightPaneOnSelection,
  userSetRightCollapsed,
  writeFlag,
  writeLeftWidth,
  type PaneStorage,
} from './panes';
import { useWorkspaceServices, WorkspaceServicesContext, type WorkspaceServices } from './services';
import {
  DEFAULT_VIEWPORT_STATE,
  deriveViewports,
  editPanelOwner,
  isMounted,
  setViewportLayout,
  setViewportMode,
  toggleMaximise,
  VIEWPORT_IDS,
  type ViewportState,
} from './viewports';

describe('destination registry', () => {
  it('lists seven destinations in the decided order, each with label, description and icon', () => {
    expect(DESTINATIONS.map((d) => d.label)).toEqual(['Project', 'Attributes', 'Building Designer', 'Algorithms', 'Scenarios', 'Camera', 'Display']);
    expect(DESTINATIONS.map((d) => d.id)).toEqual(['project', 'attributes', 'designer', 'algorithms', 'scenarios', 'camera', 'display']);
    for (const d of DESTINATIONS) {
      expect(d.description, d.id).toMatch(/\S/);
      expect(renderToStaticMarkup(createElement(d.icon)), d.id).toMatch(/^<svg/);
    }
  });

  it('has a panel slot for Scenarios, Camera and Display only', () => {
    expect(Object.keys(DESTINATION_PANELS).sort()).toEqual([...SLOT_DESTINATIONS].sort());
    expect([...SLOT_DESTINATIONS]).toEqual(['scenarios', 'camera', 'display']);
  });
});

describe('panel slots through WorkspaceServices', () => {
  const services = (over: Partial<WorkspaceServices> = {}): WorkspaceServices => ({
    design: null,
    selection: NO_SELECTION,
    onSelect: () => {},
    viewports: deriveViewports(DEFAULT_VIEWPORT_STATE),
    cameraBus: createCameraBus(),
    ...over,
  });
  const mount = (id: (typeof SLOT_DESTINATIONS)[number], value: WorkspaceServices) =>
    renderToStaticMarkup(createElement(WorkspaceServicesContext.Provider, { value }, createElement(DESTINATION_PANELS[id])));

  it('mounts every slot through the registry with a services provider; placeholders have no fake controls', () => {
    // Camera and Display are implemented (wave 1, workstream E); the remaining slots are placeholders.
    const implemented = new Set<string>(['camera', 'display']);
    for (const id of SLOT_DESTINATIONS) {
      const html = mount(id, services());
      if (implemented.has(id)) {
        expect(html, id).not.toContain('data-placeholder=');
        expect(html, id).toContain(`aria-label="${id === 'camera' ? 'Camera' : 'Display'}"`);
        continue;
      }
      expect(html, id).toContain(`data-placeholder="${id}"`);
      expect(html, id).toMatch(/not available yet/);
      expect(html, id).not.toMatch(/<(button|input|select)\b/);
    }
  });

  it('the Camera placeholder offers exactly the visible 3D viewports as explicit targets', () => {
    // Default: viewport 1 Graph 2D, viewport 2 Building (3D) visible; 3 and 4 outside the layout.
    const html = mount('camera', services());
    expect(html).toContain('aria-label="Camera target viewport"');
    expect(html).toContain('<option value="viewport-2">Viewport 2 — Building</option>');
    expect(html).not.toContain('value="viewport-1"');
    expect(html).not.toContain('value="viewport-3"');
    const none = deriveViewports(setViewportLayout(DEFAULT_VIEWPORT_STATE, 1));
    const empty = mount('camera', services({ viewports: none }));
    expect(empty).toContain('No 3D viewport is shown right now.');
    expect(empty).not.toMatch(/<select\b/);
  });

  it('useWorkspaceServices fails loudly without a provider', () => {
    const Probe = () => {
      useWorkspaceServices();
      return null;
    };
    expect(() => renderToStaticMarkup(createElement(Probe))).toThrow(/WorkspaceServicesContext/);
  });
});

describe('six view modes', () => {
  it('adds Plan and Data with a label, description, caption and a registered view', () => {
    expect(VIEW_MODES).toEqual(['graph2d', 'graph3d', 'voxels', 'architecture', 'plan', 'data']);
    expect(VIEW_LABELS.data).toBe('Data');
    expect(VIEW_LABELS.plan).toBe('Plan');
    for (const mode of VIEW_MODES) {
      expect(VIEW_DESCRIPTIONS[mode], mode).toMatch(/\S/);
      expect(VIEW_CAPTIONS[mode], mode).toMatch(/\S/);
      // Function components, or lazy (React.lazy objects) for the 3D views.
      expect(['function', 'object'], mode).toContain(typeof VIEW_COMPONENTS[mode]);
      expect(VIEW_COMPONENTS[mode], mode).toBeTruthy();
    }
  });
});

describe('the Data view mode in every view-mode list', () => {
  it('has no camera, no display settings and is never a camera target', () => {
    expect(CAMERA_VIEW_MODES).not.toContain('data');
    expect(DISPLAY_VIEW_MODES).toContain('data'); // resolvable (and accepted in project files), but
    expect(PANEL_FIELDS.data).toEqual([]); // the Display panel offers nothing for it
    for (const views of Object.values(DISPLAY_FIELD_VIEWS)) expect(views).not.toContain('data');
    const infos = deriveViewports(setViewportMode(DEFAULT_VIEWPORT_STATE, 1, 'data'));
    expect(infos[1]).toMatchObject({ mode: 'data', is3D: false });
    expect(cameraTargets(infos).map((v) => v.mode)).not.toContain('data');
    expect(editPanelOwner(infos, 1)).toBeNull();
  });
});

describe('viewport derivation', () => {
  const visible = (s: ViewportState) => deriveViewports(s).filter((v) => v.visible).map((v) => v.index);

  it('defaults to two viewports with modes Graph 2D, Building, Graph 3D, Plan', () => {
    const infos = deriveViewports(DEFAULT_VIEWPORT_STATE);
    expect(infos.map((v) => v.id)).toEqual([...VIEWPORT_IDS]);
    expect(infos.map((v) => v.mode)).toEqual(['graph2d', 'architecture', 'graph3d', 'plan']);
    expect(infos.map((v) => v.is3D)).toEqual([false, true, true, false]);
    expect(visible(DEFAULT_VIEWPORT_STATE)).toEqual([0, 1]);
  });

  it('shows the first 1, 2 or 4 viewports; the others are unmounted', () => {
    const one = setViewportLayout(DEFAULT_VIEWPORT_STATE, 1);
    const four = setViewportLayout(DEFAULT_VIEWPORT_STATE, 4);
    expect(visible(one)).toEqual([0]);
    expect(visible(four)).toEqual([0, 1, 2, 3]);
    expect([0, 1, 2, 3].map((i) => isMounted(one, i as 0))).toEqual([true, false, false, false]);
    expect(setViewportLayout(four, 4)).toBe(four);
  });

  it('maximise shows only that viewport while the others stay mounted; toggling restores', () => {
    const four = setViewportLayout(DEFAULT_VIEWPORT_STATE, 4);
    const max = toggleMaximise(four, 2);
    expect(visible(max)).toEqual([2]);
    expect([0, 1, 2, 3].every((i) => isMounted(max, i as 0))).toBe(true);
    expect(toggleMaximise(max, 2).maximised).toBeNull();
    // Maximising another viewport switches directly.
    expect(toggleMaximise(max, 0).maximised).toBe(0);
    // A viewport outside the layout cannot be maximised.
    expect(toggleMaximise(DEFAULT_VIEWPORT_STATE, 3)).toBe(DEFAULT_VIEWPORT_STATE);
  });

  it('a layout change keeps a maximise inside the layout and clears one outside it', () => {
    const max = toggleMaximise(setViewportLayout(DEFAULT_VIEWPORT_STATE, 4), 3);
    expect(setViewportLayout(max, 2).maximised).toBeNull();
    const max1 = toggleMaximise(setViewportLayout(DEFAULT_VIEWPORT_STATE, 4), 1);
    expect(setViewportLayout(max1, 2).maximised).toBe(1);
  });

  it('changes one viewport mode only', () => {
    const next = setViewportMode(DEFAULT_VIEWPORT_STATE, 3, 'voxels');
    expect(next.modes).toEqual(['graph2d', 'architecture', 'graph3d', 'voxels']);
    expect(DEFAULT_VIEWPORT_STATE.modes[3]).toBe('plan');
    expect(setViewportMode(next, 3, 'voxels')).toBe(next);
  });
});

describe('room editor owner across up to four viewports', () => {
  const state = (modes: ViewportState['modes'], layout: ViewportState['layout'] = 4, maximised: ViewportState['maximised'] = null): ViewportState => ({
    layout,
    modes,
    maximised,
  });

  it('is null with fewer than two visible editing viewports', () => {
    expect(editPanelOwner(deriveViewports(DEFAULT_VIEWPORT_STATE), 1)).toBeNull();
    expect(editPanelOwner(deriveViewports(state(['voxels', 'graph2d', 'graph3d', 'plan'])), 0)).toBeNull();
  });

  it('is the viewport last interacted with among the editing ones, else the last editing one', () => {
    const infos = deriveViewports(state(['voxels', 'graph2d', 'architecture', 'architecture']));
    expect(editPanelOwner(infos, 0)).toBe(0);
    expect(editPanelOwner(infos, 2)).toBe(2);
    expect(editPanelOwner(infos, 1)).toBe(3);
  });

  it('ignores hidden and unmounted viewports', () => {
    expect(editPanelOwner(deriveViewports(state(['voxels', 'architecture', 'architecture', 'plan'], 4, 1)), 0)).toBeNull();
    expect(editPanelOwner(deriveViewports(state(['voxels', 'graph2d', 'architecture', 'plan'], 2)), 0)).toBeNull();
    // Two-panel behaviour is unchanged: Voxels + Building → the last interacted panel.
    expect(editPanelOwner(deriveViewports(state(['voxels', 'architecture', 'graph3d', 'plan'], 2)), 0)).toBe(0);
    expect(editPanelOwner(deriveViewports(state(['voxels', 'architecture', 'graph3d', 'plan'], 2)), 1)).toBe(1);
  });
});

describe('pane width and remembered choices', () => {
  const memory = (initial: Record<string, string> = {}): PaneStorage & { values: Record<string, string> } => {
    const values = { ...initial };
    return { values, getItem: (k) => values[k] ?? null, setItem: (k, v) => void (values[k] = v) };
  };
  const throwing: PaneStorage = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };

  it('clamps the left width to 240–560 px', () => {
    expect([clampLeftWidth(100), clampLeftWidth(300.4), clampLeftWidth(9999), clampLeftWidth(Number.NaN)]).toEqual([
      LEFT_WIDTH_MIN,
      300,
      LEFT_WIDTH_MAX,
      LEFT_WIDTH_DEFAULT,
    ]);
    expect(LEFT_WIDTH_DEFAULT).toBe(300);
  });

  it('resizes by ±16 px with the arrow keys, clamped', () => {
    expect(keyboardResize(300, 'ArrowRight')).toBe(316);
    expect(keyboardResize(300, 'ArrowLeft')).toBe(284);
    expect(keyboardResize(250, 'ArrowLeft')).toBe(240);
    expect(keyboardResize(556, 'ArrowRight')).toBe(560);
    expect(keyboardResize(300, 'Enter')).toBeNull();
  });

  it('remembers the width and collapse choices; missing, invalid or refused storage falls back safely', () => {
    const s = memory();
    expect(readLeftWidth(s)).toBe(LEFT_WIDTH_DEFAULT);
    writeLeftWidth(s, 9999);
    expect(s.values[PANE_STORAGE_KEYS.leftWidth]).toBe('560');
    expect(readLeftWidth(s)).toBe(560);
    expect(readLeftWidth(memory({ [PANE_STORAGE_KEYS.leftWidth]: 'wide' }))).toBe(LEFT_WIDTH_DEFAULT);
    expect(readFlag(s, PANE_STORAGE_KEYS.leftCollapsed)).toBeNull();
    writeFlag(s, PANE_STORAGE_KEYS.leftCollapsed, true);
    expect(readFlag(s, PANE_STORAGE_KEYS.leftCollapsed)).toBe(true);
    expect(readFlag(memory({ k: 'yes' }), 'k')).toBeNull();
    // Refused storage never throws.
    expect(readLeftWidth(throwing)).toBe(LEFT_WIDTH_DEFAULT);
    expect(readFlag(throwing, 'k')).toBeNull();
    expect(() => writeLeftWidth(throwing, 300)).not.toThrow();
    expect(() => writeFlag(throwing, 'k', true)).not.toThrow();
    expect(readLeftWidth(null)).toBe(LEFT_WIDTH_DEFAULT);
  });

  it('uses an explicit left choice, else auto-collapses below 1600 px', () => {
    expect(initialLeftCollapsed(false, 1280)).toBe(false);
    expect(initialLeftCollapsed(true, 1920)).toBe(true);
    expect(initialLeftCollapsed(null, 1280)).toBe(true);
    expect(initialLeftCollapsed(null, 1920)).toBe(false);
    expect(initialLeftCollapsed(null, null)).toBe(true);
  });

  it('opens Properties on selection unless the user deliberately collapsed it', () => {
    const deliberate = userSetRightCollapsed(true);
    expect(rightPaneOnSelection(deliberate, true)).toBe(deliberate);
    expect(initialRightPane(true)).toEqual({ collapsed: true, deliberate: true });
    const incidental = { collapsed: true, deliberate: false };
    expect(rightPaneOnSelection(incidental, true)).toEqual({ collapsed: false, deliberate: false });
    expect(rightPaneOnSelection(incidental, false)).toBe(incidental);
    expect(userSetRightCollapsed(false)).toEqual({ collapsed: false, deliberate: false });
    expect(initialRightPane(null)).toEqual({ collapsed: false, deliberate: false });
  });
});
