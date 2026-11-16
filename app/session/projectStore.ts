import type { GraphIssue } from '@app/document';
import { readDesign, relationshipLabel, type DesignDocumentV2 } from '@app/document/v2';
import type { DisplayDefaults, DisplayOverrides } from '@app/display/contracts';
import {
  formatProjectIssues,
  projectFileFromState,
  projectFromLegacyDesign,
  readProjectFile,
  saveAsNewProject,
  serializeProjectFile,
  PROJECT_FILE_FORMAT,
  type ProjectFileV1,
  type ProjectIssue,
  type ProjectMeta,
  type ProjectResult,
  type SaveBlockReason,
} from '@app/project';
import { applyScenarioCommand, nextPreferences, type ScenarioCommand, type ScenarioContent } from '@app/spatial';
import type { SavedCamera } from '@core/viewer/three/camera';
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

function slotOf(record: ProjectFileV1['scenarios'][number], source: string): ScenarioSlot {
  return {
    id: record.id,
    name: record.name,
    session: openDocument<ScenarioContent>({ design: record.design, facePreferences: record.facePreferences }, source, null),
    cameras: record.cameras,
    display: record.display,
  };
}

/** Open a validated project file. Every scenario starts with a fresh, empty history. */
export function openProject(file: ProjectFileV1, origin: ProjectOrigin, options: { readonly exported?: boolean } = {}): OpenProject {
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
export function projectFileOf(project: OpenProject, at: string = project.meta.updatedAt): ProjectResult<ProjectFileV1> {
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
  const file: ProjectFileV1 = {
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
  /** `current`: a copy of the active scenario's current content and settings; `blank`: no rooms. */
  readonly from: 'current' | 'blank';
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
  const content: ScenarioContent =
    request.from === 'current'
      ? currentDocument(source.session)
      : { design: blankDesign(currentDocument(source.session).design, unique), facePreferences: {} };
  const slot: ScenarioSlot = {
    id: request.id,
    name: unique,
    session: openDocument(content, request.from === 'current' ? `copy of ${source.name}` : 'blank scenario', null),
    cameras: request.from === 'current' ? source.cameras : [],
    display: request.from === 'current' ? source.display : {},
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
    cameras: source.cameras,
    display: source.display,
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

/** The project attribute record (`exportAttributeFile` shape) or null (= the project files' schema). */
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
  | { readonly ok: true; readonly file: ProjectFileV1; readonly kind: 'project' | 'design' }
  | { readonly ok: false; readonly issues: readonly ProjectIssue[] };

export interface ReadFileOptions extends IdOptions {
  /** Code project referenced by a project made from a design file. */
  readonly definition?: { readonly projectId: string } | null;
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
      ...(options.definition !== undefined && { definition: options.definition }),
    });
    return made.ok ? { ok: true, file: made.value, kind: 'design' } : { ok: false, issues: made.issues };
  }
  return {
    ok: false,
    issues: [{ path: [], code: 'wrong-format', message: `not a Spatial Graph Lab project file ("format": "${PROJECT_FILE_FORMAT}") or design file ("schemaVersion")` }],
  };
}

/**
 * A new project from one design (a code project's default design or the built-in example): one
 * scenario, "Scenario 1".
 */
export function newProjectFromDesign(design: DesignDocumentV2, options: ReadFileOptions = {}): ProjectResult<ProjectFileV1> {
  return projectFromLegacyDesign(design, { ...options, ...(options.definition !== undefined && { definition: options.definition }) });
}

/**
 * The file to store for an opened file whose project id is already used by a DIFFERENT local
 * project: re-identified (new project and scenario ids), so opening a file never overwrites
 * another local project. Returns the file unchanged when `taken` is false.
 */
export function separateIdentity(file: ProjectFileV1, taken: boolean, options: IdOptions = {}): ProjectResult<ProjectFileV1> {
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
