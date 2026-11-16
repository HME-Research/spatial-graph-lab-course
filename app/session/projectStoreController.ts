import type { DesignDocumentV2 } from '@app/document/v2';
import type { DisplayDefaults, DisplayOverrides } from '@app/display/contracts';
import {
  formatProjectIssues,
  newProjectId as defaultProjectId,
  newScenarioId as defaultScenarioId,
  nowIso,
  serializeProjectFile,
  type DiscardResult,
  type ProjectFileV1,
  type ProjectStore,
  type ProjectSummary,
} from '@app/project';
import type { ScenarioCommand } from '@app/spatial';
import type { SavedCamera } from '@core/viewer/three/camera';
import {
  applyActiveCommand,
  commitActiveDesign,
  contentSignature,
  createScenario,
  deleteScenario,
  duplicateScenario,
  markProjectExported,
  moveScenario,
  openProject,
  projectFileOf,
  redoActive,
  renameProject,
  renameScenario,
  saveProjectAs,
  separateIdentity,
  setAttributeRecord,
  setDisplayDefaults,
  setProjectDescription,
  setScenarioCameras,
  setScenarioDisplay,
  switchScenario,
  undoActive,
  type CommandResult,
  type LocalSaveState,
  type NewScenarioRequest,
  type OpenProject,
  type Outcome,
  type ProjectOrigin,
} from './projectStore';

/**
 * Project controller (workstream B): the open local project, its scenarios and its autosave to a
 * `ProjectStore` (IndexedDB in the browser). UI-independent: React reads it through
 * `subscribe`/`getState` (`useSyncExternalStore`), tests drive it directly.
 *
 * **Startup.** The controller starts with NO project: the Welcome screen is always shown and a
 * stored project is never reopened automatically (`restore` is an explicit user choice).
 *
 * **Autosave.** Every change that must be kept (`OpenProject.changes`) schedules one debounced
 * write of the whole project file. The save state is explicit and honest:
 * `pending` → `saving` → `saved`, or `blocked` with a reason; a failed or refused write is never
 * shown as saved, and is retried on the next change (or `retrySave`).
 *
 * **Never overwrite what this tab did not see** (two tabs, same project). Writes of one project are
 * serialised: inside this tab by a single write chain, across tabs by a Web Lock
 * (`navigator.locks`, name `sgl-project:<id>`) when the browser offers one. Inside the lock the
 * stored record is read first; if its canonical text differs from what this tab last loaded or
 * wrote, the write is refused as `blocked/conflict` (the other tab's work is kept) until the user
 * chooses `overwriteStored` or Save As. Without Web Locks the read-then-write pair is not atomic
 * across tabs: two tabs writing within the same few milliseconds can still interleave (documented
 * limitation; the store contract has no compare-and-set).
 *
 * The store's own guarantees still apply: unreadable records are never overwritten
 * (`refused-unreadable`), quota/unavailable/error writes are reported, never thrown.
 */

export interface ControllerState {
  readonly project: OpenProject | null;
  readonly save: LocalSaveState;
  /** One-off information for the user (e.g. "opened as a separate copy"); cleared by `dismissNotice`. */
  readonly notice: string | null;
}

/** The part of the Web Locks API used here (injectable). */
export interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

export interface Scheduler {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface ProjectControllerOptions {
  readonly store: ProjectStore;
  /** Debounce of autosave after the last change. Default 700 ms. */
  readonly debounceMs?: number;
  readonly now?: () => string;
  readonly newProjectId?: () => string;
  readonly newScenarioId?: () => string;
  readonly scheduler?: Scheduler;
  /** Default: `navigator.locks` when available; null = no cross-tab lock. */
  readonly locks?: LockManagerLike | null;
}

export type OpenOutcome = { readonly ok: true; readonly project: OpenProject } | { readonly ok: false; readonly message: string };

export type RestoreOutcome =
  | { readonly ok: true; readonly project: OpenProject }
  | { readonly ok: false; readonly status: 'missing' | 'unreadable' | 'unavailable'; readonly message: string };

export interface ProjectController {
  getState(): ControllerState;
  subscribe(listener: () => void): () => void;

  // Lifecycle
  /** Open a validated file as the current project (a new identity if another local project uses its id). Stored at once. */
  open(file: ProjectFileV1, origin: ProjectOrigin, options?: { readonly exported?: boolean }): Promise<OpenOutcome>;
  /** Reopen a project stored in this browser (Recent). Never writes. */
  restore(projectId: string): Promise<RestoreOutcome>;
  /** Back to Welcome (pending changes are written first). */
  close(): Promise<void>;
  listRecent(): Promise<ProjectSummary[]>;
  discardUnreadable(projectId: string): Promise<DiscardResult>;

  // Active scenario (undoable)
  command(command: ScenarioCommand): CommandResult;
  commitDesign(design: DesignDocumentV2, label: string): void;
  undo(): boolean;
  redo(): boolean;

  // Scenarios
  createScenario(request: Omit<NewScenarioRequest, 'id'>): Outcome<string>;
  duplicateScenario(id: string): Outcome<string>;
  renameScenario(id: string, name: string): Outcome<void>;
  deleteScenario(id: string): Outcome<void>;
  switchScenario(id: string): Outcome<void>;
  moveScenario(id: string, delta: -1 | 1): void;

  // Project and settings
  renameProject(name: string): Outcome<void>;
  setDescription(text: string): void;
  setCameras(scenarioId: string, cameras: readonly SavedCamera[]): void;
  setScenarioDisplay(scenarioId: string, display: DisplayOverrides): void;
  setDisplayDefaults(display: DisplayDefaults): void;
  setAttributeRecord(record: unknown | null): void;

  // Files
  /** The project file to export now, and its text. Call `markExported(signature)` once the download started. */
  exportFile(): Outcome<{ readonly file: ProjectFileV1; readonly text: string; readonly signature: string }>;
  markExported(signature: string): void;
  /** Save As New Project: open an independent copy (new ids), stored at once. */
  saveAs(name?: string): Promise<Outcome<OpenProject>>;

  // Saving
  /** Write pending changes now and wait for every write in progress. */
  flush(): Promise<void>;
  retrySave(): Promise<void>;
  /** Explicit user choice after a conflict: replace the stored copy with this tab's project. */
  overwriteStored(): Promise<void>;
  dismissNotice(): void;
  dispose(): void;
}

const defaultScheduler: Scheduler = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function defaultLocks(): LockManagerLike | null {
  try {
    const locks = (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator?.locks;
    return locks && typeof locks.request === 'function' ? locks : null;
  } catch {
    return null;
  }
}

/** Bookkeeping of the project currently open (replaced on every open). */
interface Book {
  readonly projectId: string;
  /** Canonical text this tab last loaded from or wrote to the store; null = this tab never saw a stored copy. */
  known: string | null;
  /** `changes` of the last successful write; -1 = nothing written yet. */
  savedChanges: number;
  /** The write in progress, if any. */
  writing: Promise<void> | null;
  /** Another write was requested while one was running. */
  again: boolean;
  /** The user explicitly chose to overwrite a conflicting stored copy. */
  overwrite: boolean;
  timer: unknown;
}

export const CONFLICT_MESSAGE =
  'Not saved: this project was saved from another tab or window after it was opened here. To keep that work, saving here has stopped. Use “Save As New Project” to keep this version separately, or “Overwrite” to replace the stored copy.';

export function createProjectController(options: ProjectControllerOptions): ProjectController {
  const { store } = options;
  const debounceMs = options.debounceMs ?? 700;
  const now = options.now ?? nowIso;
  const newProjectId = options.newProjectId ?? defaultProjectId;
  const newScenarioId = options.newScenarioId ?? defaultScenarioId;
  const scheduler = options.scheduler ?? defaultScheduler;
  const locks = options.locks === undefined ? defaultLocks() : options.locks;

  let state: ControllerState = { project: null, save: { local: 'saved', at: '' }, notice: null };
  let book: Book | null = null;
  const listeners = new Set<() => void>();
  let disposed = false;

  const emit = () => {
    for (const l of [...listeners]) l();
  };
  const setState = (patch: Partial<ControllerState>) => {
    state = { ...state, ...patch };
    emit();
  };

  const withLock = <T>(name: string, run: () => Promise<T>): Promise<T> => (locks ? locks.request(name, run) : run());

  function cancelTimer(b: Book) {
    if (b.timer !== null) {
      scheduler.clear(b.timer);
      b.timer = null;
    }
  }

  function schedule(delay = debounceMs) {
    const b = book;
    if (!b || disposed) return;
    cancelTimer(b);
    b.timer = scheduler.set(() => {
      b.timer = null;
      void write(b);
    }, delay);
  }

  /** Replace the open project after a change; schedules a write when something is unsaved. */
  function update(next: OpenProject) {
    const current = state.project;
    if (next === current) return;
    const b = book;
    const dirty = b !== null && next.changes !== b.savedChanges;
    const conflicted = state.save.local === 'blocked' && state.save.reason === 'conflict';
    // A blocked state stays visible until a write succeeds (never silently "Saving…" over it).
    const save: LocalSaveState = dirty && state.save.local !== 'blocked' && state.save.local !== 'saving' ? { local: 'pending' } : state.save;
    setState({ project: next, save });
    if (dirty && !conflicted) schedule();
  }

  /** Write the open project of `b` (if still open) once; serialised per book. */
  function write(b: Book): Promise<void> {
    if (b.writing) {
      b.again = true;
      return b.writing;
    }
    const project = state.project;
    if (!project || project.meta.projectId !== b.projectId) return Promise.resolve();
    if (project.changes === b.savedChanges && !b.overwrite) return Promise.resolve();
    cancelTimer(b);
    if (book === b) setState({ save: { local: 'saving' } });
    const run = async () => {
      const at = now();
      const file = projectFileOf(project, at);
      if (!file.ok) {
        if (book === b) setState({ save: { local: 'blocked', reason: 'error', message: `Not saved: the project is invalid (${formatProjectIssues(file.issues)}).` } });
        return;
      }
      const text = serializeProjectFile(file.value);
      const outcome = await withLock(`sgl-project:${b.projectId}`, async () => {
        const stored = await store.load(b.projectId);
        if (stored.status === 'ok' && !b.overwrite && serializeProjectFile(stored.file) !== b.known) {
          return { status: 'conflict' as const };
        }
        return store.save(file.value);
      });
      if (outcome.status === 'saved') {
        b.known = text;
        b.savedChanges = project.changes;
        b.overwrite = false;
        if (book !== b || !state.project) return;
        const current = state.project;
        const updated: OpenProject = { ...current, meta: { ...current.meta, updatedAt: at } };
        const clean = current.changes === b.savedChanges;
        setState({ project: updated, save: clean ? { local: 'saved', at: outcome.at } : { local: 'pending' } });
        if (!clean) b.again = true;
        return;
      }
      if (book !== b) return;
      if (outcome.status === 'conflict') setState({ save: { local: 'blocked', reason: 'conflict', message: CONFLICT_MESSAGE } });
      else setState({ save: { local: 'blocked', reason: outcome.reason, message: outcome.message } });
    };
    b.writing = run()
      .catch((error: unknown) => {
        if (book === b) setState({ save: { local: 'blocked', reason: 'error', message: `Not saved: ${error instanceof Error ? error.message : String(error)}` } });
      })
      .finally(() => {
        b.writing = null;
        if (b.again) {
          b.again = false;
          if (book === b && !(state.save.local === 'blocked' && state.save.reason === 'conflict')) schedule(0);
        }
      });
    return b.writing;
  }

  /** Wait until `b` has no write in progress (and none requested). */
  async function settle(b: Book): Promise<void> {
    while (b.writing) await b.writing;
  }

  async function flushBook(b: Book | null): Promise<void> {
    if (!b) return;
    cancelTimer(b);
    if (state.project && book === b && state.project.changes !== b.savedChanges) {
      const conflicted = state.save.local === 'blocked' && state.save.reason === 'conflict';
      if (!conflicted) await write(b);
    }
    await settle(b);
  }

  /** Make `project` current with fresh bookkeeping; writes immediately when `known` is null (not yet stored). */
  function activate(project: OpenProject, known: string | null): void {
    const previous = book;
    if (previous) {
      // The previous project's pending changes are written first (fire and forget: its write
      // captured its own project and book synchronously).
      cancelTimer(previous);
      if (state.project && state.project.changes !== previous.savedChanges) void write(previous);
    }
    book = { projectId: project.meta.projectId, known, savedChanges: known === null ? -1 : project.changes, writing: null, again: false, overwrite: false, timer: null };
    setState({ project, save: known === null ? { local: 'pending' } : { local: 'saved', at: project.meta.updatedAt }, notice: null });
    if (known === null) schedule(0);
  }

  const mutate = (fn: (p: OpenProject) => OpenProject) => {
    if (state.project) update(fn(state.project));
  };

  const mutateOutcome = <T>(fn: (p: OpenProject) => Outcome<OpenProject>, value: (p: OpenProject) => T): Outcome<T> => {
    if (!state.project) return { ok: false, message: 'No project is open.' };
    const result = fn(state.project);
    if (!result.ok) return result;
    update(result.value);
    return { ok: true, value: value(result.value) };
  };

  const controller: ProjectController = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async open(file, origin, opts = {}) {
      let identityTaken = false;
      const existing = await store.load(file.projectId);
      if (existing.status === 'ok' || existing.status === 'unreadable') identityTaken = true;
      const separate = separateIdentity(file, identityTaken, { now, newId: newProjectId, newScenarioId });
      if (!separate.ok) return { ok: false, message: `The project could not be opened: ${formatProjectIssues(separate.issues)}` };
      const project = openProject(separate.value, origin, { exported: opts.exported === true && !identityTaken });
      activate(project, null);
      if (identityTaken) {
        setState({
          notice: `This browser already has a project with the id of “${file.name}”. The file was opened as a separate copy, so the stored project was not changed.`,
        });
      }
      return { ok: true, project };
    },

    async restore(projectId) {
      const loaded = await store.load(projectId);
      if (loaded.status === 'missing') return { ok: false, status: 'missing', message: 'This project is no longer stored in this browser.' };
      if (loaded.status === 'unavailable') return { ok: false, status: 'unavailable', message: `Local storage is not available: ${loaded.message}` };
      if (loaded.status === 'unreadable') {
        return {
          ok: false,
          status: 'unreadable',
          message: `The stored copy cannot be read (${formatProjectIssues(loaded.issues)}).${loaded.quarantineKey ? ` A copy is kept under “${loaded.quarantineKey}”.` : ''}`,
        };
      }
      const project = openProject(loaded.file, { kind: 'restored', label: 'this browser' });
      activate(project, serializeProjectFile(loaded.file));
      return { ok: true, project };
    },

    async close() {
      const b = book;
      await flushBook(b);
      if (book === b) {
        book = null;
        setState({ project: null, save: { local: 'saved', at: '' }, notice: null });
      }
    },

    async listRecent() {
      try {
        return await store.list();
      } catch {
        return [];
      }
    },

    discardUnreadable: (projectId) => store.discardUnreadable(projectId),

    command(command) {
      if (!state.project) return { ok: false, issues: [{ path: [], code: 'not-found', message: 'no project is open' }] };
      const result = applyActiveCommand(state.project, command);
      if (result.ok) update(result.project);
      return result;
    },
    commitDesign(design, label) {
      mutate((p) => commitActiveDesign(p, design, label));
    },
    undo() {
      const before = state.project;
      mutate(undoActive);
      return state.project !== before;
    },
    redo() {
      const before = state.project;
      mutate(redoActive);
      return state.project !== before;
    },

    createScenario(request) {
      const id = newScenarioId();
      return mutateOutcome((p) => createScenario(p, { ...request, id }), () => id);
    },
    duplicateScenario(sourceId) {
      const id = newScenarioId();
      return mutateOutcome((p) => duplicateScenario(p, sourceId, id), () => id);
    },
    renameScenario: (id, name) => mutateOutcome((p) => renameScenario(p, id, name), () => undefined),
    deleteScenario: (id) => mutateOutcome((p) => deleteScenario(p, id), () => undefined),
    switchScenario: (id) => mutateOutcome((p) => switchScenario(p, id), () => undefined),
    moveScenario(id, delta) {
      mutate((p) => moveScenario(p, id, delta));
    },

    renameProject: (name) => mutateOutcome((p) => renameProject(p, name), () => undefined),
    setDescription(text) {
      mutate((p) => setProjectDescription(p, text));
    },
    setCameras(scenarioId, cameras) {
      mutate((p) => setScenarioCameras(p, scenarioId, cameras));
    },
    setScenarioDisplay(scenarioId, display) {
      mutate((p) => setScenarioDisplay(p, scenarioId, display));
    },
    setDisplayDefaults(display) {
      mutate((p) => setDisplayDefaults(p, display));
    },
    setAttributeRecord(record) {
      mutate((p) => setAttributeRecord(p, record));
    },

    exportFile() {
      const project = state.project;
      if (!project) return { ok: false, message: 'No project is open.' };
      const file = projectFileOf(project, now());
      if (!file.ok) return { ok: false, message: `The project could not be exported: ${formatProjectIssues(file.issues)}` };
      return { ok: true, value: { file: file.value, text: serializeProjectFile(file.value), signature: contentSignature(project) } };
    },
    markExported(signature) {
      // Export bookkeeping only: not a change to save.
      if (state.project) setState({ project: markProjectExported(state.project, signature) });
    },

    async saveAs(name) {
      const project = state.project;
      if (!project) return { ok: false, message: 'No project is open.' };
      const copy = saveProjectAs(project, name, { now, newId: newProjectId, newScenarioId });
      if (!copy.ok) return copy;
      activate(copy.value, null);
      return copy;
    },

    flush: () => flushBook(book),
    async retrySave() {
      const b = book;
      if (!b || !state.project) return;
      if (state.save.local === 'blocked' && state.save.reason === 'conflict') return;
      b.savedChanges = Math.min(b.savedChanges, state.project.changes - 1);
      await write(b);
      await settle(b);
    },
    async overwriteStored() {
      const b = book;
      if (!b || !state.project) return;
      b.overwrite = true;
      b.savedChanges = Math.min(b.savedChanges, state.project.changes - 1);
      setState({ save: { local: 'pending' } });
      await write(b);
      await settle(b);
    },
    dismissNotice() {
      if (state.notice !== null) setState({ notice: null });
    },
    dispose() {
      disposed = true;
      if (book) cancelTimer(book);
      listeners.clear();
    },
  };
  return controller;
}

/** Whether the Welcome screen is shown: exactly when no project is open (always at startup). */
export const showsWelcome = (state: Pick<ControllerState, 'project'>): boolean => state.project === null;

/** Whether leaving the page now could lose local changes (for a `beforeunload` prompt). */
export const hasUnsavedLocalChanges = (state: ControllerState): boolean => state.project !== null && state.save.local !== 'saved';
