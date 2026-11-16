import { createContext, useContext, useSyncExternalStore } from 'react';
import type { ControllerState, ProjectController } from './projectStoreController';

/**
 * React access to the project controller (workstream B). Provided once by the app shell; the
 * Scenarios panel, the Project Files section and the header identity read it. Without a provider
 * (e.g. an isolated component test) `useProjectController()` returns null and panels say so.
 */
export const ProjectControllerContext = createContext<ProjectController | null>(null);

export const useProjectController = (): ProjectController | null => useContext(ProjectControllerContext);

const EMPTY: ControllerState = { project: null, save: { local: 'saved', at: '' }, notice: null };
const noop = () => () => undefined;

/** The controller's current state; re-renders on every change. */
export function useProjectControllerState(controller: ProjectController | null): ControllerState {
  return useSyncExternalStore(controller ? controller.subscribe : noop, controller ? controller.getState : () => EMPTY, controller ? controller.getState : () => EMPTY);
}
