import { describe, expect, it } from 'vitest';
import { DEFAULT_DISPLAY, DISPLAY_FIELD_VIEWS, DISPLAY_VIEW_MODES, displayOverridesSchema, resolveDisplay } from './contracts';
import { clearView, createDisplayStore, overriddenFields, PANEL_FIELDS, resolveFromStore, sceneOptionsFor, setViewField } from './displayStore';

describe('display overrides edits', () => {
  it('setViewField writes only the per-view layer of one mode and validates', () => {
    const o = setViewField(undefined, 'architecture', 'roofs', false);
    expect(o).toEqual({ views: { architecture: { roofs: false } } });
    const o2 = setViewField(o, 'architecture', 'lighting', 'soft');
    expect(o2.views?.architecture).toEqual({ roofs: false, lighting: 'soft' });
    expect(o.views?.architecture).toEqual({ roofs: false }); // input untouched
    expect(displayOverridesSchema.safeParse(o2).success).toBe(true);
    expect(resolveDisplay(DEFAULT_DISPLAY, o2, 'architecture')).toMatchObject({ roofs: false, lighting: 'soft' });
    expect(resolveDisplay(DEFAULT_DISPLAY, o2, 'voxels')).toMatchObject({ roofs: true, lighting: 'default' });
  });

  it('keeps scenario-wide overrides; clearView removes only that view', () => {
    const base = { legend: false, views: { voxels: { labels: false }, architecture: { roofs: false } } };
    expect(overriddenFields(base, 'architecture')).toEqual(['roofs']);
    const cleared = clearView(base, 'architecture');
    expect(cleared).toEqual({ legend: false, views: { voxels: { labels: false } } });
    expect(clearView(clearView(cleared, 'voxels'), 'voxels')).toEqual({ legend: false });
    expect(resolveDisplay(DEFAULT_DISPLAY, cleared, 'architecture').legend).toBe(false); // scenario-wide still applies
    expect(overriddenFields(undefined, 'graph3d')).toEqual([]);
  });

  it('the panel offers only fields the contract assigns to that view; Building is the richest', () => {
    for (const mode of DISPLAY_VIEW_MODES)
      for (const field of PANEL_FIELDS[mode]) expect(DISPLAY_FIELD_VIEWS[field], `${mode}.${field}`).toContain(mode);
    const counts = DISPLAY_VIEW_MODES.map((m) => PANEL_FIELDS[m].length);
    expect(Math.max(...counts)).toBe(PANEL_FIELDS.architecture.length);
    expect(PANEL_FIELDS.graph3d.length).toBeLessThan(PANEL_FIELDS.architecture.length);
    expect(PANEL_FIELDS.voxels.length).toBeLessThan(PANEL_FIELDS.architecture.length);
    expect(PANEL_FIELDS.architecture).toContain('roofs');
  });
});

describe('sceneOptionsFor', () => {
  it('maps appearance and allows orthographic only in Building and Voxels', () => {
    const arch = sceneOptionsFor(resolveDisplay(DEFAULT_DISPLAY, { lighting: 'soft', legend: false }, 'architecture'));
    expect(arch).toEqual({ lighting: 'soft', labels: true, legend: false, orthographic: true, navigationCube: true });
    expect(sceneOptionsFor(resolveDisplay(DEFAULT_DISPLAY, undefined, 'voxels')).orthographic).toBe(true);
    expect(sceneOptionsFor(resolveDisplay(DEFAULT_DISPLAY, undefined, 'graph3d')).orthographic).toBe(false);
  });
});

describe('display store', () => {
  it('stores overrides per scenario, validates, and notifies', () => {
    const store = createDisplayStore();
    let calls = 0;
    store.subscribe(() => calls++);
    expect(store.overrides('s1')).toEqual({});
    expect(store.overrides('s1')).toBe(store.overrides('s1'));
    expect(store.setOverrides('s1', setViewField(undefined, 'voxels', 'colourPreset', 'neutral'))).toBe(true);
    expect(resolveFromStore(store, 's1', 'voxels').colourPreset).toBe('neutral');
    expect(resolveFromStore(store, 's2', 'voxels').colourPreset).toBe('by-function'); // other scenario unaffected
    expect(calls).toBe(1);
    expect(store.setOverrides('s1', { views: { voxels: { colourPreset: 'rainbow' } } } as never)).toBe(false);
    expect(store.setOverrides('s1', { bogus: true } as never)).toBe(false);
    expect(resolveFromStore(store, 's1', 'voxels').colourPreset).toBe('neutral');
    expect(store.setDefaults({ ...DEFAULT_DISPLAY, lighting: 'soft' })).toBe(true);
    expect(resolveFromStore(store, 's2', 'graph3d').lighting).toBe('soft');
    expect(store.setDefaults({ ...DEFAULT_DISPLAY, labels: 'yes' } as never)).toBe(false);
    expect(calls).toBe(2);
  });
});
