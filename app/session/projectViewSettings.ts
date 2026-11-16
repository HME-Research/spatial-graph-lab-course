import { appSavedCameraSchema, type AppSavedCamera } from '@app/camera/savedCamera';
import type { SavedCameraStore } from '@app/camera/savedCameras';
import { DEFAULT_DISPLAY, displayDefaultsSchema, displayOverridesSchema, type DisplayDefaults, type DisplayOverrides } from '@app/display/contracts';
import type { DisplayStore } from '@app/display/displayStore';
import type { SavedCamera } from '@core/viewer/three/camera';
import type { OpenProject, ScenarioSlot } from './projectStore';
import type { ProjectController } from './projectStoreController';

/**
 * Integration I1: the Camera and Display stores of workstream E, bound to the OPEN LOCAL PROJECT
 * of the project controller (workstream B).
 *
 * - Saved cameras are each scenario's `cameras` (`ScenarioRecord.cameras`); display overrides are
 *   each scenario's `display`; display defaults are the project's `settings.display`.
 * - Every write goes through the controller (`setCameras`, `setScenarioDisplay`,
 *   `setDisplayDefaults`): it is part of the project file, autosaved and exported, and it is NOT an
 *   undo step (these are view settings, not design content).
 * - Reads always come from the controller's CURRENT project, so nothing leaks between projects even
 *   when two projects use the same scenario ids. With no project open the stores are empty and
 *   refuse writes.
 */

const NO_CAMERAS: readonly AppSavedCamera[] = Object.freeze([]);
const NO_OVERRIDES: DisplayOverrides = Object.freeze({});

const slotOf = (project: OpenProject | null, scenarioId: string): ScenarioSlot | undefined =>
  project?.scenarios.find((s) => s.id === scenarioId);

const isAppCamera = (camera: SavedCamera): camera is AppSavedCamera => appSavedCameraSchema.safeParse(camera).success;

export function createProjectCameraStore(controller: ProjectController): SavedCameraStore {
  /** Stable filtered lists per stored list (useSyncExternalStore needs stable snapshots). */
  const views = new WeakMap<readonly SavedCamera[], readonly AppSavedCamera[]>();
  const appCameras = (stored: readonly SavedCamera[]): readonly AppSavedCamera[] => {
    let view = views.get(stored);
    if (!view) {
      // A file may hold cameras of view modes this app does not show (e.g. from a newer version):
      // they are kept in the file but not offered in the Camera panel.
      view = stored.every(isAppCamera) ? (stored as readonly AppSavedCamera[]) : Object.freeze(stored.filter(isAppCamera));
      views.set(stored, view);
    }
    return view;
  };
  return {
    get(scenarioId) {
      const slot = slotOf(controller.getState().project, scenarioId);
      return slot ? appCameras(slot.cameras) : NO_CAMERAS;
    },
    set(scenarioId, cameras) {
      const slot = slotOf(controller.getState().project, scenarioId);
      if (!slot) return false;
      const ids = new Set<string>();
      for (const c of cameras) {
        if (!isAppCamera(c) || ids.has(c.id)) return false;
        ids.add(c.id);
      }
      const kept = slot.cameras.filter((c) => !isAppCamera(c) && !ids.has(c.id));
      controller.setCameras(scenarioId, Object.freeze([...cameras, ...kept]));
      return true;
    },
    subscribe: (listener) => controller.subscribe(listener),
  };
}

export function createProjectDisplayStore(controller: ProjectController): DisplayStore {
  return {
    defaults: (): DisplayDefaults => controller.getState().project?.meta.settings.display ?? DEFAULT_DISPLAY,
    overrides: (scenarioId) => slotOf(controller.getState().project, scenarioId)?.display ?? NO_OVERRIDES,
    setOverrides(scenarioId, overrides) {
      if (!slotOf(controller.getState().project, scenarioId)) return false;
      if (!displayOverridesSchema.safeParse(overrides).success) return false;
      controller.setScenarioDisplay(scenarioId, overrides);
      return true;
    },
    setDefaults(next) {
      if (!controller.getState().project) return false;
      if (!displayDefaultsSchema.safeParse(next).success) return false;
      controller.setDisplayDefaults(next);
      return true;
    },
    subscribe: (listener) => controller.subscribe(listener),
  };
}
