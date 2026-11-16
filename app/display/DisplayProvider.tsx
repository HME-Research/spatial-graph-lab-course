import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { SceneOptionsContext } from '@core/viewer/three/sceneOptions';
import { ViewDisplayContext, type ViewDisplayValue } from '@app/views/three/viewDisplay';
import { resolveDisplay, type DisplayDefaults, type DisplayOverrides, type DisplaySettings, type DisplayViewMode, type ViewDisplay } from './contracts';
import { clearView, createDisplayStore, sceneOptionsFor, setViewField, type DisplayField, type DisplayStore } from './displayStore';
import { UNBOUND_SCENARIO_ID } from '@app/camera/savedCameras';

/**
 * React binding of the Display store (workstream E).
 *
 * - `DisplayProvider` (App level): the store and the active scenario id. Without `store` it owns an
 *   in-memory store; the integration owner passes a store bound to the project file
 *   (`settings.display`, each scenario's `display`).
 * - `ViewportDisplay` (one per viewport, around the view): resolves the display for that
 *   viewport's view mode and provides it to the canvas (`SceneOptionsContext`: lighting, labels,
 *   legend, orthographic and the navigation cube) and to the view (`ViewDisplayContext`: roofs,
 *   colour preset).
 * - `useDisplay()`: the Display panel's hook.
 *
 * Without a `DisplayProvider` one module-level in-memory store is used under `UNBOUND_SCENARIO_ID`.
 */

interface DisplayBinding {
  readonly store: DisplayStore;
  readonly scenarioId: string;
}

const DisplayContext = createContext<DisplayBinding | null>(null);
const fallbackBinding: DisplayBinding = { store: createDisplayStore(), scenarioId: UNBOUND_SCENARIO_ID };

export function DisplayProvider({ scenarioId, store, children }: { readonly scenarioId: string; readonly store?: DisplayStore; readonly children?: ReactNode }) {
  const [own] = useState(() => createDisplayStore());
  const active = store ?? own;
  const value = useMemo(() => ({ store: active, scenarioId }), [active, scenarioId]);
  return <DisplayContext.Provider value={value}>{children}</DisplayContext.Provider>;
}

export interface DisplayApi {
  readonly scenarioId: string;
  readonly defaults: DisplayDefaults;
  readonly overrides: DisplayOverrides;
  resolve(mode: DisplayViewMode): ViewDisplay;
  setField<K extends DisplayField>(mode: DisplayViewMode, field: K, value: DisplaySettings[K]): boolean;
  resetView(mode: DisplayViewMode): boolean;
}

export function useDisplay(): DisplayApi {
  const { store, scenarioId } = useContext(DisplayContext) ?? fallbackBinding;
  const defaults = useSyncExternalStore(store.subscribe, store.defaults, store.defaults);
  const getOverrides = useCallback(() => store.overrides(scenarioId), [store, scenarioId]);
  const overrides = useSyncExternalStore(store.subscribe, getOverrides, getOverrides);
  return useMemo(
    () => ({
      scenarioId,
      defaults,
      overrides,
      resolve: (mode) => resolveDisplay(defaults, overrides, mode),
      setField: (mode, field, value) => store.setOverrides(scenarioId, setViewField(store.overrides(scenarioId), mode, field, value)),
      resetView: (mode) => store.setOverrides(scenarioId, clearView(store.overrides(scenarioId), mode)),
    }),
    [store, scenarioId, defaults, overrides],
  );
}

/** Provides the resolved display of `mode` to the viewport's canvas and view. */
export function ViewportDisplay({ mode, children }: { readonly mode: DisplayViewMode; readonly children?: ReactNode }) {
  const api = useDisplay();
  const display = useMemo(() => api.resolve(mode), [api, mode]);
  const options = useMemo(() => sceneOptionsFor(display), [display]);
  const view = useMemo<ViewDisplayValue>(
    () => ({ display, set: (field, value) => void api.setField(mode, field, value) }),
    [display, api, mode],
  );
  return (
    <SceneOptionsContext.Provider value={options}>
      <ViewDisplayContext.Provider value={view}>{children}</ViewDisplayContext.Provider>
    </SceneOptionsContext.Provider>
  );
}
