import type { SceneOptions } from '@core/viewer/three/sceneOptions';
import type { SceneDisplay } from '@app/views/three/viewDisplay';
import { supportsOrthographic } from '@app/camera/savedCameras';
import {
  DEFAULT_DISPLAY,
  displayDefaultsSchema,
  displayOverridesSchema,
  resolveDisplay,
  type DisplayDefaults,
  type DisplayOverrides,
  type DisplaySettings,
  type DisplayViewMode,
  type PartialDisplay,
  type ViewDisplay,
} from './contracts';

/**
 * Display state and its pure edits (workstream E). Pure: no React.
 *
 * Scope (set conservatively; see the finish report): the Display panel edits the **active
 * scenario's per-view overrides** (`DisplayOverrides.views[mode]`). Project defaults and
 * scenario-wide overrides are honoured by `resolveDisplay` when the project file provides them, but
 * this branch offers no UI to edit them. Display is appearance only and never part of undo history.
 */

/** Compile-time guard: the views-layer mirror (`SceneDisplay`) must stay identical to `ViewDisplay`. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const SHAPES_MATCH: Same<ViewDisplay, SceneDisplay> = true;
void SHAPES_MATCH;

export type DisplayField = keyof DisplaySettings;

/**
 * The fields the Display panel offers per view mode: exactly the fields that view applies in this
 * branch (no control that does nothing). Building is the richest; Graph 2D and Plan have none yet.
 */
export const PANEL_FIELDS: Readonly<Record<DisplayViewMode, readonly DisplayField[]>> = Object.freeze({
  graph2d: [],
  graph3d: ['labels', 'legend', 'lighting'],
  voxels: ['labels', 'legend', 'colourPreset', 'lighting'],
  architecture: ['labels', 'legend', 'roofs', 'colourPreset', 'lighting'],
  plan: [],
});

/** Sets one field of the per-view override of `mode`; returns new overrides (input unchanged). */
export function setViewField<K extends DisplayField>(
  overrides: DisplayOverrides | undefined,
  mode: DisplayViewMode,
  field: K,
  value: DisplaySettings[K],
): DisplayOverrides {
  const base = overrides ?? {};
  const view: PartialDisplay = { ...(base.views?.[mode] ?? {}), [field]: value };
  return { ...base, views: { ...(base.views ?? {}), [mode]: view } };
}

/** Removes the per-view override of `mode` (the view inherits scenario overrides / project defaults again). */
export function clearView(overrides: DisplayOverrides | undefined, mode: DisplayViewMode): DisplayOverrides {
  const base = overrides ?? {};
  if (!base.views?.[mode]) return base;
  const views = { ...base.views };
  delete views[mode];
  const { views: _drop, ...rest } = base;
  void _drop;
  return Object.keys(views).length > 0 ? { ...rest, views } : rest;
}

/** Fields `mode` overrides in this scenario's per-view layer. */
export function overriddenFields(overrides: DisplayOverrides | undefined, mode: DisplayViewMode): DisplayField[] {
  const view = overrides?.views?.[mode];
  if (!view) return [];
  return (Object.keys(view) as DisplayField[]).filter((f) => view[f] !== undefined);
}

/** The canvas options of a 3D viewport showing `display.mode` (appearance plus the projection/cube capabilities). */
export function sceneOptionsFor(display: ViewDisplay): SceneOptions {
  return {
    lighting: display.lighting,
    labels: display.labels,
    legend: display.legend,
    orthographic: supportsOrthographic(display.mode),
    navigationCube: true,
  };
}

// ── Store ──────────────────────────────────────────────────────────────────────────────────────

export interface DisplayStore {
  defaults(): DisplayDefaults;
  /** The scenario's overrides (`{}` when it has none). Stable reference until changed. */
  overrides(scenarioId: string): DisplayOverrides;
  /** Replaces one scenario's overrides; refused (false) unless they validate against `displayOverridesSchema`. */
  setOverrides(scenarioId: string, overrides: DisplayOverrides): boolean;
  /** Replaces the project defaults; refused (false) unless they validate. */
  setDefaults(defaults: DisplayDefaults): boolean;
  subscribe(listener: () => void): () => void;
}

const EMPTY: DisplayOverrides = Object.freeze({});

export function createDisplayStore(
  initial: { readonly defaults?: DisplayDefaults; readonly scenarios?: Readonly<Record<string, DisplayOverrides>> } = {},
): DisplayStore {
  let defaults: DisplayDefaults = initial.defaults ?? DEFAULT_DISPLAY;
  const scenarios = new Map<string, DisplayOverrides>(Object.entries(initial.scenarios ?? {}));
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of [...listeners]) listener();
  };
  return {
    defaults: () => defaults,
    overrides: (scenarioId) => scenarios.get(scenarioId) ?? EMPTY,
    setOverrides(scenarioId, overrides) {
      if (!displayOverridesSchema.safeParse(overrides).success) return false;
      scenarios.set(scenarioId, overrides);
      emit();
      return true;
    },
    setDefaults(next) {
      if (!displayDefaultsSchema.safeParse(next).success) return false;
      defaults = next;
      emit();
      return true;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The resolved display of `mode` in `scenarioId` (defaults → scenario overrides → per-view). */
export const resolveFromStore = (store: DisplayStore, scenarioId: string, mode: DisplayViewMode): ViewDisplay =>
  resolveDisplay(store.defaults(), store.overrides(scenarioId), mode);
