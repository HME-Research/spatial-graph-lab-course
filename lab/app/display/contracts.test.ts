import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { VIEW_MODES } from '@app/views/contracts';
import {
  DEFAULT_DISPLAY,
  DISPLAY_VIEW_MODES,
  displayDefaultsSchema,
  displayOverridesSchema,
  resolveDisplay,
  type DisplayDefaults,
  type DisplayOverrides,
} from './contracts';

// Compile-time: parsed schema output fits the contract types.
const _defaults: DisplayDefaults = {} as z.infer<typeof displayDefaultsSchema>;
const _overrides: DisplayOverrides = {} as z.infer<typeof displayOverridesSchema>;
void _defaults;
void _overrides;

describe('display contracts', () => {
  it('resolves display for exactly the workspace view modes', () => {
    expect(DISPLAY_VIEW_MODES).toEqual(VIEW_MODES);
  });

  it('DEFAULT_DISPLAY is a valid, frozen DisplayDefaults', () => {
    expect(displayDefaultsSchema.parse(DEFAULT_DISPLAY)).toEqual(DEFAULT_DISPLAY);
    expect(Object.isFrozen(DEFAULT_DISPLAY)).toBe(true);
  });

  it('resolves defaults alone for every view mode', () => {
    for (const mode of DISPLAY_VIEW_MODES) expect(resolveDisplay(DEFAULT_DISPLAY, undefined, mode)).toEqual({ mode, ...DEFAULT_DISPLAY });
  });

  it('applies precedence defaults → scenario overrides → per-view overrides', () => {
    const defaults: DisplayDefaults = { ...DEFAULT_DISPLAY, labels: false, lighting: 'soft' };
    const overrides: DisplayOverrides = {
      labels: true,
      roofs: false,
      views: { architecture: { roofs: true, colourPreset: 'neutral' }, graph2d: { labels: false } },
    };
    expect(resolveDisplay(defaults, overrides, 'architecture')).toEqual({
      mode: 'architecture',
      labels: true, // scenario beats project
      legend: true, // project default
      roofs: true, // per-view beats scenario
      colourPreset: 'neutral', // per-view
      lighting: 'soft', // project
    });
    expect(resolveDisplay(defaults, overrides, 'graph2d')).toMatchObject({ labels: false, roofs: false, colourPreset: 'by-function' });
    expect(resolveDisplay(defaults, overrides, 'voxels')).toMatchObject({ labels: true, roofs: false });
  });

  it('an explicitly undefined override does not clear a value, and inputs are not mutated', () => {
    const overrides: DisplayOverrides = { labels: undefined, views: { plan: { legend: undefined } } };
    const copy = structuredClone(overrides);
    expect(resolveDisplay(DEFAULT_DISPLAY, overrides, 'plan')).toEqual({ mode: 'plan', ...DEFAULT_DISPLAY });
    expect(overrides).toEqual(copy);
  });

  it('rejects unknown keys and invalid values at every level', () => {
    expect(displayDefaultsSchema.safeParse({ ...DEFAULT_DISPLAY, shadows: true }).success).toBe(false);
    expect(displayDefaultsSchema.safeParse({ labels: true }).success).toBe(false); // defaults are complete
    expect(displayDefaultsSchema.safeParse({ ...DEFAULT_DISPLAY, colourPreset: 'rainbow' }).success).toBe(false);
    expect(displayOverridesSchema.safeParse({}).success).toBe(true);
    expect(displayOverridesSchema.safeParse({ roofs: false, views: { voxels: { colourPreset: 'neutral' } } }).success).toBe(true);
    expect(displayOverridesSchema.safeParse({ shadows: true }).success).toBe(false);
    expect(displayOverridesSchema.safeParse({ views: { section: { labels: true } } }).success).toBe(false);
    expect(displayOverridesSchema.safeParse({ views: { plan: { shadows: true } } }).success).toBe(false);
    expect(displayOverridesSchema.safeParse({ views: { plan: { views: {} } } }).success).toBe(false);
    expect(displayOverridesSchema.safeParse({ lighting: 'harsh' }).success).toBe(false);
  });
});
