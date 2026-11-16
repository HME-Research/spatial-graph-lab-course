import { z } from 'zod';

/**
 * Display contract (Gate F, F-D; root-owned). Pure: no React, no Three.js.
 *
 * Display is appearance only, never generation semantics: it never changes the design, the
 * spatial resolution or the building model. It is persisted in the project file (project
 * `settings.display` and each scenario's `display`) and is NOT part of undo history.
 *
 * Precedence (later wins): `DisplayDefaults` (project) → `DisplayOverrides` (scenario, top-level
 * fields) → `DisplayOverrides.views[mode]` (scenario, per view mode). `resolveDisplay` returns the
 * resulting `ViewDisplay` for one view mode.
 */

/** View modes display can be resolved for. Mirrors the workspace view vocabulary (F-A `VIEW_MODES`). */
export const DISPLAY_VIEW_MODES = ['graph2d', 'graph3d', 'voxels', 'architecture', 'plan'] as const;
export type DisplayViewMode = (typeof DISPLAY_VIEW_MODES)[number];

export const COLOUR_PRESETS = ['by-function', 'neutral'] as const;
export type ColourPreset = (typeof COLOUR_PRESETS)[number];

export const LIGHTING_PRESETS = ['default', 'soft'] as const;
export type LightingPreset = (typeof LIGHTING_PRESETS)[number];

/** Every v1 display field, all required. */
export interface DisplaySettings {
  readonly labels: boolean;
  readonly legend: boolean;
  /** Building (architecture) views. */
  readonly roofs: boolean;
  /** Building and voxel views. */
  readonly colourPreset: ColourPreset;
  readonly lighting: LightingPreset;
}

/** Project-level display defaults: a complete set of fields. */
export type DisplayDefaults = DisplaySettings;

/** Any subset of the display fields (`undefined` = not overridden). */
export type PartialDisplay = { readonly [K in keyof DisplaySettings]?: DisplaySettings[K] | undefined };

/** Scenario-level overrides: any subset of fields, plus optional per-view-mode subsets. */
export type DisplayOverrides = PartialDisplay & {
  readonly views?: { readonly [M in DisplayViewMode]?: PartialDisplay | undefined } | undefined;
};

/** The resolved display for one view mode. Fields a view does not use (e.g. roofs in Graph 2D) are carried but ignored. */
export interface ViewDisplay extends DisplaySettings {
  readonly mode: DisplayViewMode;
}

/** Which view modes use each field (documentation for panels; resolution does not depend on it). */
export const DISPLAY_FIELD_VIEWS: Readonly<Record<keyof DisplaySettings, readonly DisplayViewMode[]>> = Object.freeze({
  labels: DISPLAY_VIEW_MODES,
  legend: DISPLAY_VIEW_MODES,
  roofs: ['architecture'],
  colourPreset: ['voxels', 'architecture'],
  lighting: ['graph3d', 'voxels', 'architecture'],
});

export const DEFAULT_DISPLAY: DisplayDefaults = Object.freeze({
  labels: true,
  legend: true,
  roofs: true,
  colourPreset: 'by-function',
  lighting: 'default',
});

const displayFields = {
  labels: z.boolean(),
  legend: z.boolean(),
  roofs: z.boolean(),
  colourPreset: z.enum(COLOUR_PRESETS),
  lighting: z.enum(LIGHTING_PRESETS),
};

export const displayDefaultsSchema = z.strictObject(displayFields);

const partialDisplaySchema = z.strictObject(displayFields).partial();

export const displayOverridesSchema = partialDisplaySchema.extend({
  views: z.partialRecord(z.enum(DISPLAY_VIEW_MODES), partialDisplaySchema).optional(),
});

const FIELDS = Object.keys(displayFields) as (keyof DisplaySettings)[];

/** Copies only the display fields that are present (so `undefined` never overwrites a value). */
function overlay(base: DisplaySettings, layer: PartialDisplay | undefined): DisplaySettings {
  if (!layer) return base;
  const out: Record<string, unknown> = { ...base };
  for (const field of FIELDS) if (layer[field] !== undefined) out[field] = layer[field];
  return out as unknown as DisplaySettings;
}

/** Defaults → scenario overrides → scenario per-view overrides, for one view mode. Pure. */
export function resolveDisplay(defaults: DisplayDefaults, overrides: DisplayOverrides | undefined, mode: DisplayViewMode): ViewDisplay {
  const base = overlay(DEFAULT_DISPLAY, defaults); // copies exactly the display fields
  const resolved = overlay(overlay(base, overrides), overrides?.views?.[mode]);
  return { mode, ...resolved };
}
