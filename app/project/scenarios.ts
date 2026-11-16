import type { SavedCamera } from '@core/viewer/three/camera';
import type { ScenarioContent } from '@app/spatial';
import type { DisplayOverrides } from '@app/display/contracts';
import { readProjectFile, serializeProjectFile, type ProjectFileV1, type ProjectResult, type ScenarioRecord } from './projectFile';

/**
 * Minimal pure conversion between the project file and the in-memory scenario shape (Gate F, F-B).
 * Scenario CRUD, per-scenario `DocumentSession<ScenarioContent>` histories and autosave
 * orchestration are built on this later (workstream B). Cameras and display are settings, not
 * undo history, so they sit beside `content`.
 */

export interface ScenarioState {
  readonly id: string;
  readonly name: string;
  /** What the scenario's undo history records. */
  readonly content: ScenarioContent;
  readonly cameras: readonly SavedCamera[];
  readonly display: DisplayOverrides;
}

/** Everything in the project file except the scenarios and the active scenario. */
export type ProjectMeta = Omit<ProjectFileV1, 'scenarios' | 'activeScenarioId'>;

export interface ProjectState {
  readonly meta: ProjectMeta;
  readonly scenarios: readonly ScenarioState[];
  readonly activeScenarioId: string;
}

const toRecord = (s: ScenarioState): ScenarioRecord => ({
  id: s.id,
  name: s.name,
  design: s.content.design,
  facePreferences: s.content.facePreferences,
  cameras: s.cameras,
  display: s.display,
});

const toState = (s: ScenarioRecord): ScenarioState => ({
  id: s.id,
  name: s.name,
  content: { design: s.design, facePreferences: s.facePreferences },
  cameras: s.cameras,
  display: s.display,
});

/**
 * Build a project file from in-memory state. The result is validated as a whole (and is a fresh
 * copy): an invalid scenario, duplicate id or unknown active scenario is refused, never written.
 */
export function projectFileFromState(state: ProjectState): ProjectResult<ProjectFileV1> {
  const file: ProjectFileV1 = { ...state.meta, activeScenarioId: state.activeScenarioId, scenarios: state.scenarios.map(toRecord) };
  return readProjectFile(serializeProjectFile(file));
}

/** In-memory state of a (validated) project file. Shares no objects with the caller's input beyond the file itself. */
export function projectStateFromFile(file: ProjectFileV1): ProjectState {
  const { scenarios, activeScenarioId, ...meta } = file;
  return { meta, scenarios: scenarios.map(toState), activeScenarioId };
}
