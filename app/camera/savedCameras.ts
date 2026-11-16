import { createContext, createElement, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { CameraPose } from '@core/viewer/three/camera';
import type { ViewMode } from '@app/views/contracts';
import { VIEW_LABELS } from '@app/ui';
import { appSavedCameraSchema, type AppSavedCamera, type CameraViewMode } from './savedCamera';

/**
 * Saved (named) cameras of a scenario (workstream E).
 *
 * - Pure list operations (`addSavedCamera`, `renameSavedCamera`, `deleteSavedCamera`, `recallPlan`)
 *   return a new list or a refusal; every new or renamed camera is validated with
 *   `appSavedCameraSchema` before it can replace the list.
 * - `SavedCameraStore`: the small interface the integration owner binds to the active scenario's
 *   `cameras` in the project file (`ScenarioRecord.cameras`). In this branch the
 *   `SavedCamerasProvider` keeps them in an in-memory store keyed by its `scenarioId` prop.
 * - `useSavedCameras()`: the Camera panel's hook. Without a provider it uses one module-level
 *   in-memory store under `UNBOUND_SCENARIO_ID` (so the panel still works in other hosts and tests).
 *
 * Saved cameras are view settings, not design content: they are never part of undo history.
 */

/** 3D view modes whose canvas may show an orthographic projection (Building and Voxels; Graph 3D stays perspective). */
export const ORTHOGRAPHIC_VIEW_MODES: readonly CameraViewMode[] = ['voxels', 'architecture'];
export const supportsOrthographic = (mode: ViewMode): boolean => (ORTHOGRAPHIC_VIEW_MODES as readonly ViewMode[]).includes(mode);

export const UNBOUND_SCENARIO_ID = 'scenario-unbound';

export type CameraListResult = { readonly ok: true; readonly cameras: readonly AppSavedCamera[] } | { readonly ok: false; readonly message: string };

/** "View 1", "View 2", …: the first name not used yet. */
export function nextCameraName(cameras: readonly { readonly name: string }[]): string {
  const used = new Set(cameras.map((c) => c.name.trim().toLowerCase()));
  for (let n = 1; ; n++) if (!used.has(`view ${n}`)) return `View ${n}`;
}

/** `camera-1`, `camera-2`, …: the first id not used in this list (never derived from the name). */
export function newCameraId(cameras: readonly { readonly id: string }[]): string {
  const used = new Set(cameras.map((c) => c.id));
  for (let n = cameras.length + 1; ; n++) if (!used.has(`camera-${n}`)) return `camera-${n}`;
}

const validate = (camera: unknown): AppSavedCamera | string => {
  const parsed = appSavedCameraSchema.safeParse(camera);
  if (parsed.success) return parsed.data as AppSavedCamera;
  const issue = parsed.error.issues[0];
  return issue ? `${issue.path.join('.') || 'camera'}: ${issue.message}` : 'invalid camera';
};

/** Appends a named camera (blank name → `nextCameraName`). Refuses a duplicate name (case-insensitive) or an invalid pose. */
export function addSavedCamera(
  cameras: readonly AppSavedCamera[],
  input: { readonly name: string; readonly viewMode: CameraViewMode; readonly pose: CameraPose },
  id: string = newCameraId(cameras),
): CameraListResult {
  const name = input.name.trim() || nextCameraName(cameras);
  if (cameras.some((c) => c.name.trim().toLowerCase() === name.toLowerCase()))
    return { ok: false, message: `A saved camera is already called “${name}”.` };
  if (cameras.some((c) => c.id === id)) return { ok: false, message: `Camera id “${id}” is already used.` };
  const camera = validate({ id, name, viewMode: input.viewMode, pose: input.pose });
  if (typeof camera === 'string') return { ok: false, message: `The current view cannot be saved (${camera}).` };
  return { ok: true, cameras: [...cameras, camera] };
}

export function renameSavedCamera(cameras: readonly AppSavedCamera[], id: string, name: string): CameraListResult {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, message: 'A saved camera needs a name.' };
  const index = cameras.findIndex((c) => c.id === id);
  if (index < 0) return { ok: false, message: 'That saved camera no longer exists.' };
  if (cameras.some((c) => c.id !== id && c.name.trim().toLowerCase() === trimmed.toLowerCase()))
    return { ok: false, message: `A saved camera is already called “${trimmed}”.` };
  const next = [...cameras];
  next[index] = { ...cameras[index]!, name: trimmed };
  return { ok: true, cameras: next };
}

export function deleteSavedCamera(cameras: readonly AppSavedCamera[], id: string): CameraListResult {
  if (!cameras.some((c) => c.id === id)) return { ok: false, message: 'That saved camera no longer exists.' };
  return { ok: true, cameras: cameras.filter((c) => c.id !== id) };
}

export type RecallPlan = { readonly ok: true; readonly note: string | null } | { readonly ok: false; readonly message: string };

/**
 * Whether a saved camera may be recalled onto a viewport showing `targetMode`. All 3D views share
 * one Y-up world, so a camera saved in one 3D view may be recalled in another 3D view (with a note);
 * a 2D view (Graph 2D, Plan) is never a target. An orthographic camera needs a view that shows
 * orthographic projections (Building, Voxels).
 */
export function recallPlan(camera: Pick<AppSavedCamera, 'viewMode' | 'pose'>, targetMode: ViewMode, targetIs3D: boolean): RecallPlan {
  if (!targetIs3D) return { ok: false, message: `${VIEW_LABELS[targetMode]} is not a 3D view; saved cameras apply only to 3D views.` };
  if (camera.pose.projection === 'orthographic' && !supportsOrthographic(targetMode))
    return { ok: false, message: `This camera is orthographic; ${VIEW_LABELS[targetMode]} shows perspective only. Recall it in Building or Voxels.` };
  if (camera.viewMode !== targetMode)
    return { ok: true, note: `Saved in ${VIEW_LABELS[camera.viewMode]}, applied to ${VIEW_LABELS[targetMode]} (allowed: all 3D views share the same 3D space).` };
  return { ok: true, note: null };
}

// ── Store ──────────────────────────────────────────────────────────────────────────────────────

export interface SavedCameraStore {
  /** The cameras of one scenario (empty when it has none). Stable reference until changed. */
  get(scenarioId: string): readonly AppSavedCamera[];
  /** Replaces one scenario's cameras; refused (false, nothing changed) unless every camera is valid and ids are unique. */
  set(scenarioId: string, cameras: readonly AppSavedCamera[]): boolean;
  subscribe(listener: () => void): () => void;
}

const NONE: readonly AppSavedCamera[] = Object.freeze([]);

export function createMemorySavedCameraStore(initial: Readonly<Record<string, readonly AppSavedCamera[]>> = {}): SavedCameraStore {
  const lists = new Map<string, readonly AppSavedCamera[]>(Object.entries(initial));
  const listeners = new Set<() => void>();
  return {
    get: (scenarioId) => lists.get(scenarioId) ?? NONE,
    set(scenarioId, cameras) {
      const ids = new Set<string>();
      for (const c of cameras) {
        if (typeof validate(c) === 'string' || ids.has(c.id)) return false;
        ids.add(c.id);
      }
      lists.set(scenarioId, Object.freeze([...cameras]));
      for (const listener of [...listeners]) listener();
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

interface SavedCamerasBinding {
  readonly store: SavedCameraStore;
  readonly scenarioId: string;
}

const SavedCamerasContext = createContext<SavedCamerasBinding | null>(null);
const fallbackBinding: SavedCamerasBinding = { store: createMemorySavedCameraStore(), scenarioId: UNBOUND_SCENARIO_ID };

/** Provides the saved cameras of `scenarioId`; without `store` an in-memory store owned by this provider. */
export function SavedCamerasProvider({ scenarioId, store, children }: { readonly scenarioId: string; readonly store?: SavedCameraStore; readonly children?: ReactNode }) {
  const [own] = useState(createMemorySavedCameraStore);
  const active = store ?? own;
  const value = useMemo(() => ({ store: active, scenarioId }), [active, scenarioId]);
  return createElement(SavedCamerasContext.Provider, { value }, children);
}

export interface SavedCamerasApi {
  readonly scenarioId: string;
  readonly cameras: readonly AppSavedCamera[];
  /** Saves `pose` under `name` (blank → "View n"). */
  save(input: { readonly name: string; readonly viewMode: CameraViewMode; readonly pose: CameraPose }): CameraListResult;
  rename(id: string, name: string): CameraListResult;
  remove(id: string): CameraListResult;
}

export function useSavedCameras(): SavedCamerasApi {
  const { store, scenarioId } = useContext(SavedCamerasContext) ?? fallbackBinding;
  const cameras = useSyncExternalStore(
    store.subscribe,
    () => store.get(scenarioId),
    () => store.get(scenarioId),
  );
  const commit = useCallback(
    (result: CameraListResult): CameraListResult => {
      if (result.ok && !store.set(scenarioId, result.cameras)) return { ok: false, message: 'The saved cameras could not be stored.' };
      return result;
    },
    [store, scenarioId],
  );
  return useMemo(
    () => ({
      scenarioId,
      cameras,
      save: (input) => commit(addSavedCamera(store.get(scenarioId), input)),
      rename: (id, name) => commit(renameSavedCamera(store.get(scenarioId), id, name)),
      remove: (id) => commit(deleteSavedCamera(store.get(scenarioId), id)),
    }),
    [scenarioId, cameras, commit, store],
  );
}
