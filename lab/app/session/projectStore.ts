import { type DesignDocumentV2, type GraphIssue, readDesign, relationshipLabel } from '@app/document';
import type { DisplayDefaults, DisplayOverrides } from '@app/display/contracts';
import {
  facadeAssetsOf,
  formatProjectIssues,
  projectAssetsOf,
  projectFileFromState,
  projectFromLegacyDesign,
  readProjectFile,
  saveAsNewProject,
  serializeProjectFile,
  PROJECT_FILE_FORMAT,
  type ProjectFileV2,
  type ProjectFunction,
  type ProjectIssue,
  type ProjectMeta,
  type ProjectResult,
  type SaveBlockReason,
} from '@app/project';
import { applyScenarioCommand, nextPreferences, type ScenarioCommand, type ScenarioContent } from '@app/spatial';
import {
  canonicalFacadeAsset,
  FACADE_LIMITS,
  facadeAssetIdsOf,
  facadeAssetsBytes,
  finishOf,
  formatBytes,
  cardsUsingFacade,
  withFinish,
  withoutFacadeAsset,
  type FacadeAssetV1,
  type FacadeMaterial,
  type FacadeRole,
} from '@app/assets';
import type { SavedCamera } from '@core/viewer/three/camera';
import type { StoredToolkit, StoredUpload } from '@app/extensions';
import {
  commitDocument,
  currentDocument,
  designCommandLabel,
  openDocument,
  redoDocument,
  undoDocument,
  type DocumentSession,
} from './documentSession';

/**
 * The open local project (workstream B): pure, UI-independent state and transitions.
 *
 * - One project = its meta (identity, definition, attribute record, display defaults) + several
 *   scenarios. Each scenario owns its own `DocumentSession<ScenarioContent>`: design + face
 *   preferences are undoable, and undo/redo only ever touch the ACTIVE scenario's history.
 *   Histories live in memory only (a reload or a restore starts each scenario with a fresh history).
 * - Cameras and display overrides sit beside the session: opaque settings, autosaved, never undone.
 * - `changes` counts every change that must reach local storage (content, names, scenario list,
 *   active scenario, settings). The autosaver compares it to what it last wrote.
 * - `exportedSignature` is the content signature of the last exported (or opened-from-file) state.
 *   "Not exported" is NOT "unsaved": local saving is tracked separately by the autosaver.
 *
 * Every function returns a new project (or the same object for a no-op) and never mutates input.
 * Refusals are returned as readable messages, never thrown.
 */

export interface ScenarioSlot {
  readonly id: string;
  readonly name: string;
  readonly session: DocumentSession<ScenarioContent>;
  readonly cameras: readonly SavedCamera[];
  readonly display: DisplayOverrides;
}

export type ProjectOriginKind = 'created' | 'example' | 'opened-file' | 'imported-design' | 'restored' | 'save-as';

export interface ProjectOrigin {
  readonly kind: ProjectOriginKind;
  /** Short description, e.g. a file name or "this browser". */
  readonly label: string;
}

export interface OpenProject {
  readonly meta: ProjectMeta;
  /** At least one; unique ids. Order is the user's order. */
  readonly scenarios: readonly ScenarioSlot[];
  readonly activeScenarioId: string;
  /** Increases on every change that must be saved locally. */
  readonly changes: number;
  /**
   * Highest document revision ever shown in this project. Switching scenario gives the newly
   * active session a revision above it, so revision-bound results (algorithm previews, analysis
   * overlays) of another scenario are always stale.
   */
  readonly revision: number;
  /** `contentSignature` of the last exported state (or of the file it was opened from); null = never. */
  readonly exportedSignature: string | null;
  readonly origin: ProjectOrigin;
}

export type Outcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

const refuse = <T>(message: string): Outcome<T> => ({ ok: false, message });
const accept = <T>(value: T): Outcome<T> => ({ ok: true, value });

export const MAX_NAME_LENGTH = 80;

// ---------------------------------------------------------------------------------------------
// Construction and conversion

function slotOf(record: ProjectFileV2['scenarios'][number], source: string): ScenarioSlot {
  return {
    id: record.id,
    name: record.name,
    session: openDocument<ScenarioContent>({ design: record.design, facePreferences: record.facePreferences }, source, null),
    cameras: record.cameras,
    display: record.display,
  };
}

/** Open a validated project file. Every scenario starts with a fresh, empty history. */
export function openProject(file: ProjectFileV2, origin: ProjectOrigin, options: { readonly exported?: boolean } = {}): OpenProject {
  const { scenarios, activeScenarioId, ...meta } = file;
  const slots = scenarios.map((s) => slotOf(s, origin.label));
  const project: OpenProject = {
    meta,
    scenarios: slots,
    activeScenarioId,
    changes: 0,
    revision: 1,
    exportedSignature: null,
    origin,
  };
  // The active session is shown first; bump it so its revision is the project's highest.
  const opened = withActiveRevision(project);
  return options.exported ? { ...opened, exportedSignature: contentSignature(opened) } : opened;
}

/** The project file for the current state (validated as a whole; `updatedAt` = `at`). */
export function projectFileOf(project: OpenProject, at: string = project.meta.updatedAt): ProjectResult<ProjectFileV2> {
  return projectFileFromState({
    meta: { ...project.meta, updatedAt: at },
    activeScenarioId: project.activeScenarioId,
    scenarios: project.scenarios.map((s) => ({ id: s.id, name: s.name, content: currentDocument(s.session), cameras: s.cameras, display: s.display })),
  });
}

/**
 * Content signature: the canonical project text with `updatedAt` neutralised, so saving (which
 * only moves `updatedAt`) never changes it. Used for "exported" bookkeeping only.
 */
export function contentSignature(project: OpenProject): string {
  const file: ProjectFileV2 = {
    ...project.meta,
    updatedAt: project.meta.createdAt,
    activeScenarioId: project.activeScenarioId,
    scenarios: project.scenarios.map((s) => {
      const c = currentDocument(s.session);
      return { id: s.id, name: s.name, design: c.design, facePreferences: c.facePreferences, cameras: s.cameras, display: s.display };
    }),
  };
  return serializeProjectFile(file);
}

export const isExported = (project: OpenProject): boolean => project.exportedSignature !== null && project.exportedSignature === contentSignature(project);

/** After a successful export of the current state. */
export function markProjectExported(project: OpenProject, signature: string = contentSignature(project)): OpenProject {
  return signature === project.exportedSignature ? project : { ...project, exportedSignature: signature };
}

// ---------------------------------------------------------------------------------------------
// Queries

export const activeSlot = (project: OpenProject): ScenarioSlot => project.scenarios.find((s) => s.id === project.activeScenarioId)!;
export const activeSession = (project: OpenProject): DocumentSession<ScenarioContent> => activeSlot(project).session;
export const activeContent = (project: OpenProject): ScenarioContent => currentDocument(activeSession(project));
export const activeDesign = (project: OpenProject): DesignDocumentV2 => activeContent(project).design;
export const scenarioById = (project: OpenProject, id: string): ScenarioSlot | undefined => project.scenarios.find((s) => s.id === id);

// ---------------------------------------------------------------------------------------------
// Internal helpers

function withActiveRevision(project: OpenProject): OpenProject {
  const revision = project.revision + 1;
  return {
    ...project,
    revision,
    scenarios: project.scenarios.map((s) => (s.id === project.activeScenarioId ? { ...s, session: { ...s.session, revision } } : s)),
  };
}

const changed = (project: OpenProject, patch: Partial<OpenProject>): OpenProject => ({ ...project, ...patch, changes: project.changes + 1 });

function replaceSlot(project: OpenProject, id: string, update: (slot: ScenarioSlot) => ScenarioSlot): OpenProject {
  return { ...project, scenarios: project.scenarios.map((s) => (s.id === id ? update(s) : s)) };
}

/** Record the active session `next` (from a command, undo or redo). */
function withActiveSession(project: OpenProject, next: DocumentSession<ScenarioContent>): OpenProject {
  if (next === activeSession(project)) return project;
  const updated = replaceSlot(project, project.activeScenarioId, (s) => ({ ...s, session: next }));
  return changed(updated, { revision: Math.max(project.revision, next.revision) });
}

/** A readable, trimmed name, or a refusal. */
export function checkName(raw: string, what: string): Outcome<string> {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length === 0) return refuse(`The ${what} name must not be empty.`);
  if (name.length > MAX_NAME_LENGTH) return refuse(`The ${what} name is too long (at most ${MAX_NAME_LENGTH} characters).`);
  return accept(name);
}

/** `base`, or `base (2)`, `base (3)`, … — the first name not used by another scenario (case-insensitive). */
export function uniqueScenarioName(project: Pick<OpenProject, 'scenarios'>, base: string, exceptId?: string): string {
  const taken = new Set(project.scenarios.filter((s) => s.id !== exceptId).map((s) => s.name.toLowerCase()));
  const stem = base.trim().slice(0, MAX_NAME_LENGTH - 5) || 'Scenario';
  if (!taken.has(stem.toLowerCase())) return stem;
  for (let n = 2; ; n++) {
    const candidate = `${stem} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** "Scenario N" for the first N not in use. */
export const nextScenarioName = (project: Pick<OpenProject, 'scenarios'>): string => {
  const taken = new Set(project.scenarios.map((s) => s.name.toLowerCase()));
  for (let n = project.scenarios.length + 1; ; n++) if (!taken.has(`scenario ${n}`)) return `Scenario ${n}`;
};

// ---------------------------------------------------------------------------------------------
// Active-scenario editing (undoable)

export type CommandResult =
  | { readonly ok: true; readonly project: OpenProject; readonly changed: boolean }
  | { readonly ok: false; readonly issues: readonly GraphIssue[] };

/** Undo/Redo label of a scenario command. */
export function scenarioCommandLabel(command: ScenarioCommand, design: DesignDocumentV2): string {
  switch (command.type) {
    case 'set-face-preference': {
      const which = design.edges.some((e) => e.id === command.edgeId) ? relationshipLabel(design, command.edgeId) : command.edgeId;
      return command.preference === null ? `Clear the chosen wall of ${which}` : `Choose the wall of ${which}`;
    }
    case 'add-edge-at-face':
      return designCommandLabel({ type: 'add-edge', edge: command.edge }, design);
    default:
      return designCommandLabel(command, design);
  }
}

/** Apply one command to the ACTIVE scenario: one history step on success; refusals change nothing. */
export function applyActiveCommand(project: OpenProject, command: ScenarioCommand): CommandResult {
  const session = activeSession(project);
  const before = currentDocument(session);
  const result = applyScenarioCommand(before, command);
  if (!result.ok) return { ok: false, issues: result.issues };
  const next = commitDocument(session, result.value, scenarioCommandLabel(command, before.design));
  const updated = withActiveSession(project, next);
  return { ok: true, project: updated, changed: updated !== project };
}

/**
 * Record an already validated design (e.g. an applied algorithm result derived from the active
 * design) as one step of the active scenario. The face preferences are rebased/pruned with it.
 */
export function commitActiveDesign(project: OpenProject, design: DesignDocumentV2, label: string): OpenProject {
  const session = activeSession(project);
  const before = currentDocument(session);
  if (design === before.design) return project;
  const content: ScenarioContent = { design, facePreferences: nextPreferences(before.facePreferences, before.design, design) };
  return withActiveSession(project, commitDocument(session, content, label));
}

export const undoActive = (project: OpenProject): OpenProject => withActiveSession(project, undoDocument(activeSession(project)));
export const redoActive = (project: OpenProject): OpenProject => withActiveSession(project, redoDocument(activeSession(project)));

// ---------------------------------------------------------------------------------------------
// Scenario management (not undoable; autosaved)

/** A structural copy of plain JSON data (cameras, display settings). */
const deepCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * The saved cameras of a scenario, copied for a NEW scenario: deep copies with new ids derived
 * from the new scenario's id, so no camera object or id is shared between scenarios.
 */
export function copyCameras(cameras: readonly SavedCamera[], scenarioId: string): SavedCamera[] {
  return cameras.map((camera, index) => {
    const suffix = `-camera-${index + 1}`;
    return { ...deepCopy(camera), id: `${scenarioId.slice(0, 64 - suffix.length)}${suffix}` };
  });
}

/** A design with no rooms that keeps `from`'s Building settings (type appearance). */
export function blankDesign(from: DesignDocumentV2, name: string): DesignDocumentV2 {
  const read = readDesign({ schemaVersion: 2, metadata: { name }, nodes: [], edges: [], diagram: { positions: {} }, settings: from.settings });
  if (!read.ok) throw new Error(`a blank design must be valid: ${read.issues.map((i) => i.message).join('; ')}`);
  return read.value.doc;
}

export interface NewScenarioRequest {
  readonly id: string;
  /** Default: the next free "Scenario N". */
  readonly name?: string;
  /**
   * `current`: a copy of the active scenario's current content and settings; `blank`: no rooms
   * (Building settings kept); `design`: the given validated design (e.g. a toolkit's design).
   */
  readonly from: 'current' | 'blank' | 'design';
  /** Required when `from` is `design`. */
  readonly design?: DesignDocumentV2;
  /** Where a `design` came from (history source label). */
  readonly source?: string;
}

function addSlot(project: OpenProject, slot: ScenarioSlot, afterId: string): OpenProject {
  const index = project.scenarios.findIndex((s) => s.id === afterId);
  const scenarios = [...project.scenarios];
  scenarios.splice(index + 1, 0, slot);
  return withActiveRevision(changed(project, { scenarios, activeScenarioId: slot.id }));
}

/** Create a scenario after the active one and make it active. Its history starts empty. */
export function createScenario(project: OpenProject, request: NewScenarioRequest): Outcome<OpenProject> {
  if (project.scenarios.some((s) => s.id === request.id)) return refuse(`A scenario with id "${request.id}" already exists.`);
  const name = checkName(request.name ?? nextScenarioName(project), 'scenario');
  if (!name.ok) return name;
  const unique = uniqueScenarioName(project, name.value);
  const source = activeSlot(project);
  let content: ScenarioContent;
  let label: string;
  if (request.from === 'current') {
    content = currentDocument(source.session);
    label = `copy of ${source.name}`;
  } else if (request.from === 'design') {
    if (request.design === undefined) return refuse('No design was given for the new scenario.');
    content = { design: request.design, facePreferences: {} };
    label = request.source ?? 'design';
  } else {
    content = { design: blankDesign(currentDocument(source.session).design, unique), facePreferences: {} };
    label = 'blank scenario';
  }
  const slot: ScenarioSlot = {
    id: request.id,
    name: unique,
    session: openDocument(content, label, null),
    cameras: request.from === 'current' ? copyCameras(source.cameras, request.id) : [],
    display: request.from === 'current' ? deepCopy(source.display) : {},
  };
  return accept(addSlot(project, slot, source.id));
}

/** Copy scenario `sourceId` (its current content and settings, not its history) and make the copy active. */
export function duplicateScenario(project: OpenProject, sourceId: string, newId: string): Outcome<OpenProject> {
  const source = scenarioById(project, sourceId);
  if (!source) return refuse('That scenario no longer exists.');
  if (project.scenarios.some((s) => s.id === newId)) return refuse(`A scenario with id "${newId}" already exists.`);
  const name = uniqueScenarioName(project, `${source.name} copy`);
  const slot: ScenarioSlot = {
    id: newId,
    name,
    session: openDocument(currentDocument(source.session), `copy of ${source.name}`, null),
    cameras: copyCameras(source.cameras, newId),
    display: deepCopy(source.display),
  };
  return accept(addSlot(project, slot, source.id));
}

export function renameScenario(project: OpenProject, id: string, raw: string): Outcome<OpenProject> {
  const slot = scenarioById(project, id);
  if (!slot) return refuse('That scenario no longer exists.');
  const name = checkName(raw, 'scenario');
  if (!name.ok) return name;
  if (name.value === slot.name) return accept(project);
  if (project.scenarios.some((s) => s.id !== id && s.name.toLowerCase() === name.value.toLowerCase())) {
    return refuse(`Another scenario is already called “${name.value}”.`);
  }
  return accept(changed(replaceSlot(project, id, (s) => ({ ...s, name: name.value })), {}));
}

/** Delete a scenario (never the last). Deleting the active one activates its neighbour. */
export function deleteScenario(project: OpenProject, id: string): Outcome<OpenProject> {
  const index = project.scenarios.findIndex((s) => s.id === id);
  if (index < 0) return refuse('That scenario no longer exists.');
  if (project.scenarios.length === 1) return refuse('A project needs at least one scenario, so the last one cannot be deleted.');
  const scenarios = project.scenarios.filter((s) => s.id !== id);
  if (project.activeScenarioId !== id) return accept(changed(project, { scenarios }));
  const neighbour = scenarios[Math.min(index, scenarios.length - 1)]!;
  return accept(withActiveRevision(changed(project, { scenarios, activeScenarioId: neighbour.id })));
}

/** Make `id` active. Atomic: histories are untouched; only which one Undo/Redo and the views use. */
export function switchScenario(project: OpenProject, id: string): Outcome<OpenProject> {
  if (!scenarioById(project, id)) return refuse('That scenario no longer exists.');
  if (id === project.activeScenarioId) return accept(project);
  return accept(withActiveRevision(changed(project, { activeScenarioId: id })));
}

/** Move a scenario one place up (-1) or down (+1) in the list. */
export function moveScenario(project: OpenProject, id: string, delta: -1 | 1): OpenProject {
  const index = project.scenarios.findIndex((s) => s.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= project.scenarios.length) return project;
  const scenarios = [...project.scenarios];
  [scenarios[index], scenarios[target]] = [scenarios[target]!, scenarios[index]!];
  return changed(project, { scenarios });
}

// ---------------------------------------------------------------------------------------------
// Project meta and settings (not undoable; autosaved)

export function renameProject(project: OpenProject, raw: string): Outcome<OpenProject> {
  const name = checkName(raw, 'project');
  if (!name.ok) return name;
  return accept(name.value === project.meta.name ? project : changed(project, { meta: { ...project.meta, name: name.value } }));
}

export function setProjectDescription(project: OpenProject, raw: string): OpenProject {
  const text = raw.trim();
  const current = project.meta.description ?? '';
  if (text === current) return project;
  const { description: _old, ...rest } = project.meta;
  return changed(project, { meta: text ? { ...rest, description: text } : rest });
}

/** Cameras of a scenario (opaque to B; validated with the whole file before every save). */
export function setScenarioCameras(project: OpenProject, id: string, cameras: readonly SavedCamera[]): OpenProject {
  const slot = scenarioById(project, id);
  if (!slot || slot.cameras === cameras) return project;
  return changed(replaceSlot(project, id, (s) => ({ ...s, cameras })), {});
}

export function setScenarioDisplay(project: OpenProject, id: string, display: DisplayOverrides): OpenProject {
  const slot = scenarioById(project, id);
  if (!slot || slot.display === display) return project;
  return changed(replaceSlot(project, id, (s) => ({ ...s, display })), {});
}

export function setDisplayDefaults(project: OpenProject, display: DisplayDefaults): OpenProject {
  if (project.meta.settings.display === display) return project;
  return changed(project, { meta: { ...project.meta, settings: { ...project.meta.settings, display } } });
}

/**
 * The calculated values (metric ids) the project shows (`settings.calculatedFields`). The caller
 * passes a canonical list (`sanitizeEnabledMetrics` / `setMetricEnabled`). Not undoable; autosaved.
 */
export function setCalculatedFields(project: OpenProject, ids: readonly string[]): OpenProject {
  const current = project.meta.settings.calculatedFields;
  if (current && current.length === ids.length && current.every((id, i) => id === ids[i])) return project;
  return changed(project, { meta: { ...project.meta, settings: { ...project.meta.settings, calculatedFields: [...ids] } } });
}

/** The built-in analyses listed in Analyse (`settings.analyses`, P4). Not undoable; autosaved. */
export function setShownAnalyses(project: OpenProject, ids: readonly string[]): OpenProject {
  const current = project.meta.settings.analyses;
  if (current && current.length === ids.length && current.every((id, i) => id === ids[i])) return project;
  return changed(project, { meta: { ...project.meta, settings: { ...project.meta.settings, analyses: [...ids] } } });
}

/**
 * The uploaded analyses (`settings.uploadedAnalyses`, P4 item I): source text per upload, in panel
 * order. The caller has already checked each new upload. Not undoable; autosaved and exported.
 */
export function setUploadedAnalyses(project: OpenProject, uploads: readonly StoredUpload[]): OpenProject {
  return setStoredUploads(project, 'uploadedAnalyses', uploads);
}

/**
 * The uploaded transforms (`settings.uploadedTransforms`, 2026-11-25): source text per upload, in
 * panel order, exactly like `setUploadedAnalyses`. Not undoable; autosaved and exported.
 */
export function setUploadedTransforms(project: OpenProject, uploads: readonly StoredUpload[]): OpenProject {
  return setStoredUploads(project, 'uploadedTransforms', uploads);
}

function setStoredUploads(project: OpenProject, key: 'uploadedAnalyses' | 'uploadedTransforms', uploads: readonly StoredUpload[]): OpenProject {
  const current = project.meta.settings[key] ?? [];
  const same =
    current.length === uploads.length &&
    current.every((u, i) => u.id === uploads[i]!.id && u.source === uploads[i]!.source && u.fileName === uploads[i]!.fileName && u.addedAt === uploads[i]!.addedAt);
  if (same) return project;
  const settings = { ...project.meta.settings, [key]: uploads.map((u) => ({ id: u.id, fileName: u.fileName, source: u.source, addedAt: u.addedAt })) };
  return changed(project, { meta: { ...project.meta, settings } });
}

/** The project functions (`settings.functions`): node types added in the browser. Not undoable; autosaved. */
export function setProjectFunctions(project: OpenProject, functions: readonly ProjectFunction[], hidden: readonly string[] = project.meta.settings.hiddenFunctions ?? []): OpenProject {
  const current = project.meta.settings.functions ?? [];
  const currentHidden = project.meta.settings.hiddenFunctions ?? [];
  const sameFunctions = current.length === functions.length && current.every((f, i) => f.id === functions[i]!.id && f.label === functions[i]!.label);
  const sameHidden = currentHidden.length === hidden.length && currentHidden.every((id, i) => id === hidden[i]);
  if (sameFunctions && sameHidden) return project;
  // A removed project function takes its own colour with it (a later function may get its id).
  const kept = new Set(functions.map((f) => f.id));
  const gone = current.filter((f) => !kept.has(f.id)).map((f) => f.id);
  const colours = withoutColours(project.meta.settings.functionColours, gone);
  const base = { ...project.meta.settings, functions: functions.map((f) => ({ id: f.id, label: f.label })), hiddenFunctions: [...hidden] };
  const { functionColours: _dropped, ...rest } = base;
  const settings = colours === undefined ? rest : { ...rest, functionColours: colours };
  return changed(project, { meta: { ...project.meta, settings } });
}

/** How a student settles a project function whose id a toolkit function now also has. */
export type FunctionClashChoice = 'keep-mine' | 'use-toolkit';

/** A design with every use of function `from` (rooms and Designer cards) moved to `to`. Pure. */
export function withFunctionMoved(design: DesignDocumentV2, from: string, to: string): DesignDocumentV2 {
  const moves = design.nodes.some((n) => n.function === from);
  const setup = Object.hasOwn(design.settings.styles, 'function') ? design.settings.styles['function'] : undefined;
  const cardMoves = setup?.groups?.some((g) => g.value === from) === true;
  if (!moves && !cardMoves) return design;
  const nodes = moves ? design.nodes.map((n) => (n.function === from ? { ...n, function: to } : n)) : design.nodes;
  const settings = cardMoves
    ? { ...design.settings, styles: { ...design.settings.styles, function: { ...setup!, groups: setup!.groups!.map((g) => (g.value === from ? { ...g, value: to } : g)) } } }
    : design.settings;
  return { ...design, nodes, settings };
}

/**
 * Settle a clash (2026-11-22, owner decision): a project function (`settings.functions`) whose id a
 * toolkit function now also defines (the toolkit gained it after the student made theirs). Until the
 * student chooses, the toolkit's definition applies and nothing is saved. Either choice keeps the
 * student's function under a new id and suffixed name (`rename`, e.g. "Gallery 2"), with its own colour:
 * - `keep-mine`: every room and Designer card using the id in every scenario moves to the new id,
 *   so the design looks as before (ONE undo step per affected scenario; an undo moves those rooms
 *   back to the toolkit's function).
 * - `use-toolkit`: designs are not changed; the rooms take the toolkit's function.
 */
export function resolveFunctionClash(project: OpenProject, functionId: string, choice: FunctionClashChoice, rename: ProjectFunction): Outcome<OpenProject> {
  const current = project.meta.settings.functions ?? [];
  const mine = current.find((f) => f.id === functionId);
  if (!mine) return refuse('That function is not one of this project’s own functions.');
  if (current.some((f) => f.id === rename.id) || rename.id === functionId) return refuse('That new function id is already taken.');
  const functions = current.map((f) => (f.id === functionId ? { id: rename.id, label: rename.label } : f));
  const colours = project.meta.settings.functionColours;
  const ownColour = colours !== undefined && Object.hasOwn(colours, functionId) ? colours[functionId]! : undefined;
  const movedColours = ownColour === undefined ? colours : { ...withoutColours(colours, [functionId]), [rename.id]: ownColour };
  const { functionColours: _old, ...rest } = { ...project.meta.settings, functions };
  const settings = movedColours === undefined ? rest : { ...rest, functionColours: movedColours };
  let revision = project.revision;
  const scenarios =
    choice === 'use-toolkit'
      ? project.scenarios
      : project.scenarios.map((s) => {
          const content = currentDocument(s.session);
          const design = withFunctionMoved(content.design, functionId, rename.id);
          if (design === content.design) return s;
          const session = commitDocument(s.session, { ...content, design }, `Keep your “${mine.label}” as “${rename.label}”`);
          revision = Math.max(revision, session.revision);
          return { ...s, session };
        });
  return accept(changed(project, { scenarios, revision, meta: { ...project.meta, settings } }));
}

function withoutColours(colours: Readonly<Record<string, string>> | undefined, ids: readonly string[]): Readonly<Record<string, string>> | undefined {
  if (colours === undefined || !ids.some((id) => Object.hasOwn(colours, id))) return colours;
  const next = Object.fromEntries(Object.entries(colours).filter(([id]) => !ids.includes(id)));
  return Object.keys(next).length === 0 ? undefined : next;
}

/**
 * The project's own colour of one function (`settings.functionColours`, Functions dialog), or
 * `null` to go back to the default (the toolkit's colour, else automatic). Like the other
 * function edits: saved with the project at once, not part of Undo. `colour` must be `#rrggbb`;
 * it is stored in lowercase. Setting the colour already stored changes nothing.
 */
export function setFunctionColour(project: OpenProject, functionId: string, colour: string | null): OpenProject {
  if (colour !== null && !/^#[0-9a-fA-F]{6}$/.test(colour)) return project;
  const current = project.meta.settings.functionColours;
  const next = colour === null ? withoutColours(current, [functionId]) : { ...current, [functionId]: colour.toLowerCase() };
  if (next === current || (colour !== null && current?.[functionId] === colour.toLowerCase())) return project;
  const { functionColours: _old, ...rest } = project.meta.settings;
  const settings = next === undefined ? rest : { ...rest, functionColours: next };
  return changed(project, { meta: { ...project.meta, settings } });
}

/**
 * Imported façades (`assets`, owner decision D4): project-level, shared by every scenario, not
 * undoable, autosaved and exported with the project. Adding an asset already present (same content
 * id) changes nothing. The per-project limits are enforced here and again when the file is read.
 */
export function addFacadeAsset(project: OpenProject, asset: FacadeAssetV1): Outcome<OpenProject> {
  const current = facadeAssetsOf(project.meta.assets);
  if (current.some((a) => a.id === asset.id)) return accept(project);
  if (current.length >= FACADE_LIMITS.maxAssets) return refuse(`A project can hold at most ${FACADE_LIMITS.maxAssets} imported façades. Remove one first.`);
  const total = facadeAssetsBytes([...current, asset]);
  if (total > FACADE_LIMITS.maxTotalBytes) {
    return refuse(`Imported façades would take ${formatBytes(total)}; a project can hold ${formatBytes(FACADE_LIMITS.maxTotalBytes)}. Simplify the mesh in Rhino or remove another façade.`);
  }
  return accept(changed(project, { meta: { ...project.meta, assets: projectAssetsOf([...current, asset]) } }));
}

/** Scenario names whose CURRENT design uses the imported façade `assetId` (default or a function). */
export function scenariosUsingFacade(project: OpenProject, assetId: string): string[] {
  return project.scenarios.filter((s) => facadeAssetIdsOf(currentDocument(s.session).design).includes(assetId)).map((s) => s.name);
}

/** Where the imported façade `assetId` is used: per scenario (in order), the type ids using it (as façade or bay). */
export interface FacadeUse {
  readonly scenarioId: string;
  readonly scenario: string;
  /** Designer cards using it (readable names, e.g. "gallery", "Default"). */
  readonly cards: readonly string[];
}

export function facadeUses(project: OpenProject, assetId: string): FacadeUse[] {
  return project.scenarios.flatMap((s) => {
    const cards = cardsUsingFacade(currentDocument(s.session).design, assetId);
    return cards.length > 0 ? [{ scenarioId: s.id, scenario: s.name, cards }] : [];
  });
}

/**
 * Remove an imported façade. While a scenario uses it, removal is refused unless `replaceUses`
 * (owner 2026-11-17: the student confirmed): then every use in every scenario becomes the automatic
 * geometry first (`withoutFacadeAsset`), recorded as ONE undo step per affected scenario. An undo
 * can bring back a design that refers to the removed façade: the Building then draws nothing for
 * it and the Designer says it is missing.
 */
export function removeFacadeAsset(project: OpenProject, assetId: string, options: { readonly replaceUses?: boolean } = {}): Outcome<OpenProject> {
  const current = facadeAssetsOf(project.meta.assets);
  const asset = current.find((a) => a.id === assetId);
  if (!asset) return refuse('That imported façade is not in this project.');
  const users = scenariosUsingFacade(project, assetId);
  if (users.length > 0 && !options.replaceUses) {
    return refuse(`This façade is used in ${users.length === 1 ? 'scenario' : 'scenarios'} ${users.map((n) => `“${n}”`).join(', ')}. Choose another façade there first.`);
  }
  let revision = project.revision;
  const scenarios = project.scenarios.map((s) => {
    const content = currentDocument(s.session);
    const design = withoutFacadeAsset(content.design, assetId);
    if (design === content.design) return s;
    const session = commitDocument(s.session, { ...content, design }, `Remove façade ${asset.name} (now Automatic)`);
    revision = Math.max(revision, session.revision);
    return { ...s, session };
  });
  return accept(changed(project, { scenarios, revision, meta: { ...project.meta, assets: projectAssetsOf(current.filter((a) => a.id !== assetId)) } }));
}

/** Rename an imported façade (display name only; its id and geometry never change). */
export function renameFacadeAsset(project: OpenProject, assetId: string, raw: string): Outcome<OpenProject> {
  const current = facadeAssetsOf(project.meta.assets);
  const asset = current.find((a) => a.id === assetId);
  if (!asset) return refuse('That imported façade is not in this project.');
  const name = raw.trim();
  if (name.length === 0) return refuse('A façade name must not be empty.');
  if (name.length > FACADE_LIMITS.maxNameLength) return refuse(`A façade name can have at most ${FACADE_LIMITS.maxNameLength} characters.`);
  if (name === asset.name) return accept(project);
  return accept(changed(project, { meta: { ...project.meta, assets: projectAssetsOf(current.map((a) => (a.id === assetId ? { ...a, name } : a))) } }));
}

/** One material group of an imported façade, as the student sets it (Materials dialog). */
export type { FacadeMaterial };

/**
 * Change the colour and finish (solid / glass / open) of an imported façade's material groups
 * for one use (owner 2026-11-17): `wall` (the façade; the groups' own materials) or a Door / Open
 * bay (`bayMaterials`; `null` = the same as the façade). Project-level like the façade itself
 * (every scenario using it sees the change; not undoable). The mesh, and so the asset id, is
 * unchanged; `materials` has one entry per group, in order.
 */
export function setFacadeAssetMaterials(
  project: OpenProject,
  assetId: string,
  materials: readonly FacadeMaterial[] | null,
  role: FacadeRole = 'wall',
): Outcome<OpenProject> {
  const current = facadeAssetsOf(project.meta.assets);
  const asset = current.find((a) => a.id === assetId);
  if (!asset) return refuse('That imported façade is not in this project.');
  if (materials === null && role === 'wall') return refuse('The façade needs its materials.');
  if (materials && materials.length !== asset.groups.length) return refuse('The materials do not match the parts of this façade.');
  const colour = /^#[0-9a-f]{6}$/;
  if (materials?.some((m) => !colour.test(m.color.toLowerCase()))) return refuse('A colour must be #rrggbb.');
  const clean = materials?.map((m) => withFinish(m.color.toLowerCase(), finishOf(m))) ?? null;
  let next: FacadeAssetV1;
  if (role === 'wall') {
    next = { ...asset, groups: asset.groups.map((g, i) => ({ name: g.name, ...clean![i]!, start: g.start, count: g.count })) };
  } else {
    const { [role]: _old, ...others } = asset.bayMaterials ?? {};
    const bay = clean ? { ...others, [role]: clean } : others;
    const { bayMaterials: _bay, ...rest } = asset;
    next = Object.keys(bay).length > 0 ? { ...rest, bayMaterials: bay } : rest;
  }
  if (JSON.stringify(canonicalFacadeAsset(next)) === JSON.stringify(canonicalFacadeAsset(asset))) return accept(project);
  return accept(changed(project, { meta: { ...project.meta, assets: projectAssetsOf(current.map((a) => (a.id === assetId ? next : a))) } }));
}

/** `next` if its whole project file is valid (as it would be saved), else the readable reason. */
function validated(next: OpenProject, what: string): Outcome<OpenProject> {
  const file = projectFileOf(next);
  return file.ok ? accept(next) : refuse(`${what}: ${formatProjectIssues(file.issues)}`);
}

/**
 * A new version of the project's UPLOADED toolkit (owner 2026-11-26): same name only (another
 * toolkit starts a new project). Rooms, attributes and settings stay; not undoable (confirmed in
 * the UI); autosaved and exported. The caller has already loaded and validated the toolkit.
 */
export function setUploadedToolkit(project: OpenProject, toolkit: StoredToolkit): Outcome<OpenProject> {
  if (project.meta.toolkit?.id !== toolkit.name) {
    return refuse(`This project's toolkit is ${project.meta.toolkit === null ? 'none' : `“${project.meta.toolkit.id}”`}, not “${toolkit.name}”.`);
  }
  return validated(changed(project, { meta: { ...project.meta, settings: { ...project.meta.settings, uploadedToolkit: toolkit } } }), 'The toolkit could not be stored');
}

/** Adding a toolkit to a project without one (`attachToolkit`). */
export interface ToolkitAttachment {
  readonly toolkitId: string;
  /** The toolkit's files when it was uploaded (absent: a repository toolkit). */
  readonly uploaded?: StoredToolkit;
  /** The project's attribute record afterwards (`planToolkitAttach`). */
  readonly attributes: unknown;
}

/**
 * Add a toolkit to a project that has NONE (owner 2026-11-26): the project's toolkit, the
 * attribute record merged with the toolkit's attributes (planned and checked by
 * `planToolkitAttach`) and, for an uploaded toolkit, its files. Designs are not touched. Not
 * undoable (confirmed in the UI); the whole file is validated before anything changes.
 */
export function attachToolkit(project: OpenProject, request: ToolkitAttachment): Outcome<OpenProject> {
  if (project.meta.toolkit !== null) return refuse(`This project already uses the toolkit “${project.meta.toolkit.id}”.`);
  if (request.uploaded && request.uploaded.name !== request.toolkitId) return refuse('The uploaded toolkit does not match the chosen toolkit.');
  const settings = request.uploaded ? { ...project.meta.settings, uploadedToolkit: request.uploaded } : project.meta.settings;
  return validated(changed(project, { meta: { ...project.meta, toolkit: { id: request.toolkitId }, attributes: request.attributes, settings } }), 'The toolkit could not be added');
}

/** The project attribute record (`exportAttributeFile` shape) or null (= the toolkit files' schema). */
export function setAttributeRecord(project: OpenProject, record: unknown | null): OpenProject {
  if (JSON.stringify(project.meta.attributes ?? null) === JSON.stringify(record ?? null)) return project;
  return changed(project, { meta: { ...project.meta, attributes: record ?? null } });
}

// ---------------------------------------------------------------------------------------------
// Files

export interface IdOptions {
  readonly now?: () => string;
  readonly newId?: () => string;
  readonly newScenarioId?: () => string;
}

/**
 * Save As New Project: an independent copy of the CURRENT state (all scenarios, the attribute
 * record and settings) with a new project id and new scenario ids. Histories are not copied.
 */
export function saveProjectAs(project: OpenProject, rawName: string | undefined, options: IdOptions = {}): Outcome<OpenProject> {
  const name = rawName === undefined ? accept(project.meta.name) : checkName(rawName, 'project');
  if (!name.ok) return name;
  const file = projectFileOf(project);
  if (!file.ok) return refuse(`The project could not be copied: ${formatProjectIssues(file.issues)}`);
  const copy = saveAsNewProject(file.value, { name: name.value, ...options });
  if (!copy.ok) return refuse(`The project could not be copied: ${formatProjectIssues(copy.issues)}`);
  return accept(openProject(copy.value, { kind: 'save-as', label: `copy of ${project.meta.name}` }));
}

export type ReadFileOutcome =
  | { readonly ok: true; readonly file: ProjectFileV2; readonly kind: 'project' | 'design' }
  | { readonly ok: false; readonly issues: readonly ProjectIssue[] };

export interface ReadFileOptions extends IdOptions {
  /** Toolkit referenced by a project made from a design file. */
  readonly toolkit?: { readonly id: string } | null;
  /** Project name for a design file (default: the design's metadata name). */
  readonly name?: string;
}

/**
 * Read a user-chosen file: a project file (`format: spatial-graph-lab/project`) or a design file
 * (schema v1 or v2), which becomes a new project with one scenario. Validated as a whole; never
 * throws; nothing replaces the current state on failure.
 */
export function readProjectOrDesign(text: string, options: ReadFileOptions = {}): ReadFileOutcome {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, issues: [{ path: [], code: 'invalid-json', message: `file is not valid JSON: ${error instanceof Error ? error.message : String(error)}` }] };
  }
  const obj = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (obj && 'format' in obj) {
    const read = readProjectFile(raw);
    return read.ok ? { ok: true, file: read.value, kind: 'project' } : { ok: false, issues: read.issues };
  }
  if (obj && 'schemaVersion' in obj) {
    const made = projectFromLegacyDesign(raw, {
      ...options,
      ...(options.toolkit !== undefined && { toolkit: options.toolkit }),
    });
    return made.ok ? { ok: true, file: made.value, kind: 'design' } : { ok: false, issues: made.issues };
  }
  return {
    ok: false,
    issues: [{ path: [], code: 'wrong-format', message: `not a Spatial Graph Lab project file ("format": "${PROJECT_FILE_FORMAT}") or design file ("schemaVersion")` }],
  };
}

/**
 * A new project from one design (a toolkit's default design or the built-in example): one
 * scenario, "Scenario 1".
 */
export function newProjectFromDesign(design: DesignDocumentV2, options: ReadFileOptions = {}): ProjectResult<ProjectFileV2> {
  return projectFromLegacyDesign(design, { ...options, ...(options.toolkit !== undefined && { toolkit: options.toolkit }) });
}

/**
 * The file to store for an opened file whose project id is already used by a DIFFERENT local
 * project: re-identified (new project and scenario ids), so opening a file never overwrites
 * another local project. Returns the file unchanged when `taken` is false.
 */
export function separateIdentity(file: ProjectFileV2, taken: boolean, options: IdOptions = {}): ProjectResult<ProjectFileV2> {
  if (!taken) return { ok: true, value: file };
  return saveAsNewProject(file, { name: file.name, ...options });
}

/** Save state of the open project, as shown to the user. */
export type LocalSaveState =
  /** Everything up to `changes` is in local storage. */
  | { readonly local: 'saved'; readonly at: string }
  /** Changes are waiting for the next (debounced) write. */
  | { readonly local: 'pending' }
  | { readonly local: 'saving' }
  /** The last write did not happen. Never shown as saved. */
  | { readonly local: 'blocked'; readonly reason: SaveBlockReason | 'conflict'; readonly message: string };

export const SAVE_STATE_TEXT: Readonly<Record<LocalSaveState['local'], string>> = {
  saved: 'Saved in this browser',
  pending: 'Saving…',
  saving: 'Saving…',
  blocked: 'Not saved',
};
