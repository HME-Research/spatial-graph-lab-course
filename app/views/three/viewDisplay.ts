import { createContext, useContext, useState } from 'react';
import type { ViewMode } from '../contracts';
import type { Coloring } from './colorBy';

/**
 * The resolved Display settings of the viewport a view is rendered in (workstream E). Views may
 * not import the shell-level `app/display/`, so this views-layer context carries the same shape as
 * `ViewDisplay` (`app/display/contracts.ts`; `app/display/displayStore.ts` asserts the two stay
 * identical). Provided per viewport by `app/display` (`ViewportDisplay`); without a provider every
 * hook falls back to the view's previous local behaviour.
 *
 * Display is appearance only: nothing here changes the design, its resolution or the building model.
 */
export interface SceneDisplay {
  readonly mode: ViewMode;
  readonly labels: boolean;
  readonly legend: boolean;
  readonly roofs: boolean;
  readonly colourPreset: 'by-function' | 'neutral';
  readonly lighting: 'default' | 'soft';
}

export type SceneDisplayField = Exclude<keyof SceneDisplay, 'mode'>;

export interface ViewDisplayValue {
  readonly display: SceneDisplay;
  /** Writes one field for this viewport's view mode (the host decides the scope: the active scenario's per-view override). */
  readonly set: <K extends SceneDisplayField>(field: K, value: SceneDisplay[K]) => void;
}

export const ViewDisplayContext = createContext<ViewDisplayValue | null>(null);

/** The viewport's display, or null outside a provider (tests, other hosts). */
export function useViewDisplay(): SceneDisplay | null {
  return useContext(ViewDisplayContext)?.display ?? null;
}

/**
 * Roof visibility of the Building view as `[visible, setVisible]`. With a provider it is the
 * Display setting (the in-view checkbox and the Display panel are one control); without one it is
 * view-local state starting at `fallback`, exactly as before. Hides roofs visually only.
 */
export function useRoofsDisplay(fallback: boolean): readonly [boolean, (visible: boolean) => void] {
  const context = useContext(ViewDisplayContext);
  const [local, setLocal] = useState(fallback);
  if (!context) return [local, setLocal];
  return [context.display.roofs, (visible: boolean) => context.set('roofs', visible)];
}

/** Single neutral colour of the `neutral` colour preset (rooms, exterior walls). */
export const NEUTRAL_COLOUR = '#d9d6cf';

/** View modes whose function colours follow the colour preset (`DISPLAY_FIELD_VIEWS.colourPreset`). */
const PRESET_MODES: ReadonlySet<ViewMode> = new Set<ViewMode>(['voxels', 'architecture']);

/** True when `display` asks this view to replace function (type) colours with the neutral colour. */
export const isNeutral = (display: SceneDisplay | null): boolean =>
  display !== null && display.colourPreset === 'neutral' && PRESET_MODES.has(display.mode);

/** Exterior wall / room colour under the preset: the function colour, or the neutral colour. */
export const presetColour = (functionColour: string, display: SceneDisplay | null): string =>
  isNeutral(display) ? NEUTRAL_COLOUR : functionColour;

/**
 * The `neutral` preset applied to a function (type) colouring: every room in one neutral colour,
 * one legend row. Attribute and access-group colourings are explicit view choices and are returned
 * unchanged by the caller (it only calls this for the type colouring).
 */
export function neutralColoring(coloring: Coloring): Coloring {
  const colorOf = new Map<string, string>();
  for (const id of coloring.colorOf.keys()) colorOf.set(id, NEUTRAL_COLOUR);
  const count = coloring.legend.reduce((sum, e) => sum + e.count, 0);
  return {
    title: `${coloring.title} (neutral preset)`,
    colorOf,
    missing: coloring.missing,
    legend: count > 0 ? [{ label: 'All rooms (Display: neutral)', color: NEUTRAL_COLOUR, count }] : [],
    note: 'Display → Colour preset is neutral; choose “By function” to colour rooms by type.',
  };
}
