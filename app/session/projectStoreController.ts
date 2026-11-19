import type { DesignDocumentV2 } from '@app/document';
import type { DisplayDefaults, DisplayOverrides } from '@app/display/contracts';
import {
  createLocalStorageExportMarks,
  createLocalStorageKeptMarks,
  exportMarkOf,
  formatProjectIssues,
  newProjectId as defaultProjectId,
  newScenarioId as defaultScenarioId,
  nowIso,
  serializeProjectFile,
  type DiscardResult,
  type ExportMarks,
  type KeptMarks,
  type ProjectFileV2,
  type ProjectFunction,
  type ProjectStore,
  type ProjectSummary,
} from '@app/project';
import type { ScenarioCommand } from '@app/spatial';
import type { SavedCamera } from '@core/viewer/three/camera';
import type { FacadeAssetV1, FacadeRole } from '@app/assets';
import {
  addFacadeAsset,
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
  removeFacadeAsset,
  facadeUses,
  renameFacadeAsset,
  setFacadeAssetMaterials,
  renameProject,
  renameScenario,
  saveProjectAs,
  separateIdentity,
  setAttributeRecord,
  setCalculatedFields,
  setShownAnalyses,
  setDisplayDefaults,
  setProjectFunctions,
  setProjectDescription,
  setScenarioCameras,
  setScenarioDisplay,
  switchScenario,
  undoActive,
  type CommandResult,
  type FacadeMaterial,
  type FacadeUse,
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
  /**
   * The open project was saved locally by the user (Save locally / Save as new project / restored
   * from the saved list). false = it is the last session only: autosaved, but replaced when another
   * project becomes the last session.
   */
  readonly kept?: boolean;
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
  /** Where "exported" is remembered beside the stored records. Default: `localStorage` (best effort). */
  readonly exportMarks?: ExportMarks;
  /** Which stored projects the user saved locally. Default: `localStorage` (best effort). */
  readonly keptMarks?: KeptMarks;
}

/**
 * Leaving the shown project (open, restore, close). Its pending changes are written first; if
 * they still cannot be stored (blocked: quota, conflict, …) nothing happens unless `discard` is
 * set — an explicit user decision. Changes are never dropped silently.
 */
export interface LeaveOptions {
  readonly discard?: boolean;
}

export type OpenOutcome =
  | { readonly ok: true; readonly project: OpenProject }
  /** `needsConfirmation`: the shown project has changes that could not be stored (ask, then retry with `discard`). */
  | { readonly ok: false; readonly message: string; readonly needsConfirmation?: true };

export type RestoreOutcome =
  | { readonly ok: true; readonly project: OpenProject }
  /** `busy`: another open/restore/close/Save As is still in progress (nothing changed). */
  | { readonly ok: false; readonly status: 'missing' | 'unreadable' | 'unavailable' | 'needs-confirmation' | 'busy'; readonly message: string };

/** Projects stored in this browser, or why they cannot be listed. */
export type RecentList =
  /** `unsaved`: ids of stored projects that are only the last session (not saved locally). */
  | { readonly status: 'ok'; readonly items: readonly ProjectSummary[]; readonly unsaved?: readonly string[] }
  | { readonly status: 'unavailable'; readonly message: string };

export interface ProjectController {
  getState(): ControllerState;
  subscribe(listener: () => void): () => void;

  // Lifecycle
  /** Open a validated file as the current project (a new identity if another local project uses its id). Stored at once. */
  open(file: ProjectFileV2, origin: ProjectOrigin, options?: { readonly exported?: boolean } & LeaveOptions): Promise<OpenOutcome>;
  /** Reopen a project stored in this browser (Recent). Never writes it. */
  restore(projectId: string, options?: LeaveOptions): Promise<RestoreOutcome>;
  /**
   * Back to Welcome. Pending changes are written first; when they cannot be stored, nothing is
   * closed and `false` is returned unless `discard` is set (an explicit user decision).
   */
  close(options?: LeaveOptions): Promise<boolean>;
  listRecent(): Promise<RecentList>;
  /** Unstored changes or a write in progress (for a `beforeunload` prompt). */
  hasPendingWork(): boolean;
  /** Show a one-off notice (e.g. from a host flow). */
  notify(message: string): void;
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
  /** Project `settings.calculatedFields` (canonical metric ids). Not undoable; autosaved. */
  setCalculatedFields(ids: readonly string[]): void;
  /** Project `settings.analyses` (the built-ins listed in Analyse, P4). Not undoable; autosaved. */
  setShownAnalyses(ids: readonly string[]): void;
  /** Project `settings.functions` (node types added in the browser). Not undoable; autosaved. */
  setFunctions(functions: readonly ProjectFunction[], hiddenFunctions: readonly string[]): void;
  setAttributeRecord(record: unknown | null): void;
  /** Add an imported façade (project `assets`). Not undoable; autosaved and exported. Same id twice: no change. */
  addFacadeAsset(asset: FacadeAssetV1): Outcome<void>;
  /**
   * Remove an imported façade. Refused while any scenario uses it, unless `replaceUses` (confirmed
   * by the student): then those uses become Automatic first (one undo step per affected scenario).
   * The asset removal itself is not undoable.
   */
  removeFacadeAsset(assetId: string, options?: { readonly replaceUses?: boolean }): Outcome<void>;
  /** Where an imported façade is used (scenario names and type ids), for the confirmation. */
  facadeUses(assetId: string): readonly FacadeUse[];
  /** Rename an imported façade (display name only). Not undoable. */
  renameFacadeAsset(assetId: string, name: string): Outcome<void>;
  /**
   * Colour and finish (solid / glass / open) per material group of an imported façade for one use
   * (`wall` default; a Door / Open bay, where `null` = same as the façade). Project-level, not undoable.
   */
  setFacadeAssetMaterials(assetId: string, materials: readonly FacadeMaterial[] | null, role?: FacadeRole): Outcome<void>;

  // Files
  /** The project file to export now, and its text. Call `markExported(signature)` once the download started. */
  exportFile(): Outcome<{ readonly file: ProjectFileV2; readonly text: string; readonly signature: string }>;
  markExported(signature: string): void;
  /**
   * Save As New Project: open an independent copy (new ids) of the CURRENT state, stored at once.
   * Not guarded by `LeaveOptions`: the copy carries every unsaved change, so nothing is lost (it is
   * also the way out of a blocked or conflicting save). The original keeps its last stored state.
   */
  saveAs(name?: string): Promise<Outcome<OpenProject>>;
  /**
   * Save locally: keep the open project in this browser's saved projects (it is written now and
   * then autosaved as before). Without it, the project is only the last session and is replaced
   * when another project becomes the last session.
   */
  saveLocally(): Promise<Outcome<void>>;

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

/**
 * Bookkeeping of one opened project (a new book on every open/restore/Save As). Leaving a project
 * (open, restore, close) first writes everything in its book; a book with unstored changes is
 * dropped only after an explicit discard (Save As carries them into the copy).
 */
interface Book {
  readonly projectId: string;
  /** The newest state of this project (what the next write stores). */
  latest: OpenProject;
  /** Canonical text this tab last loaded from or wrote to the store; null = this tab never saw a stored copy. */
  known: string | null;
  /** `changes` of the last successful write; -1 = nothing written yet. */
  savedChanges: number;
  /** This project's save state (mirrored to `ControllerState.save` while it is shown). */
  status: LocalSaveState;
  /** The write in progress, if any. */
  writing: Promise<void> | null;
  /** Another write was requested while one was running. */
  again: boolean;
  /** The user explicitly chose to overwrite a conflicting stored copy (for the next write only). */
  overwrite: boolean;
  timer: unknown;
}

/**
 * A change requested while the shown project is being left (open, restore, close, Save As): it is
 * refused, never applied to a project that is about to be dropped.
 */
export const BUSY_MESSAGE = 'Not changed: a project is being opened, copied or closed. Try again in a moment.';

export const CONFLICT_MESSAGE =
  'Not saved: this project was saved from another tab or window after it was opened here. To keep that work, saving here has stopped. Use “Save as new project” to keep this version separately, or “Overwrite” to replace the stored copy.';

const isConflicted = (b: Book): boolean => b.status.local === 'blocked' && b.status.reason === 'conflict';
const isDirty = (b: Book): boolean => b.latest.changes !== b.savedChanges || b.overwrite;

export function createProjectController(options: ProjectControllerOptions): ProjectController {
  const { store } = options;
  const debounceMs = options.debounceMs ?? 700;
  const now = options.now ?? nowIso;
  const newProjectId = options.newProjectId ?? defaultProjectId;
  const newScenarioId = options.newScenarioId ?? defaultScenarioId;
  const scheduler = options.scheduler ?? defaultScheduler;
  const locks = options.locks === undefined ? defaultLocks() : options.locks;
  const exportMarks = options.exportMarks ?? createLocalStorageExportMarks();
  const keptMarks = options.keptMarks ?? createLocalStorageKeptMarks();

  /**
   * One-time reset (per browser): forget every saved-locally mark and remove every readable stored
   * project except `keep` (the last session). Earlier projects, including ones the first version of
   * the marks adopted as saved, are cleared. Unreadable records are never touched. Returns the
   * summaries still stored. Best effort: a failed removal leaves that record in place.
   */
  async function resetOnce(items: readonly ProjectSummary[], keep: string | null): Promise<readonly ProjectSummary[]> {
    if (keptMarks.initialised()) return items;
    keptMarks.clear();
    const left: ProjectSummary[] = [];
    for (const s of items) {
      if (s.status === 'ok' && s.projectId !== keep && (await store.remove(s.projectId)).status === 'removed') continue;
      left.push(s);
    }
    keptMarks.setInitialised();
    return left;
  }

  /**
   * Only the last session is kept without asking: remove every other READABLE stored project the
   * user did not save locally. Unreadable records are never touched. Best effort: failures leave
   * the record in place. Nothing is removed when the marks cannot be used.
   */
  async function pruneUnsaved(current: string): Promise<void> {
    if (!keptMarks.available()) return;
    let items: readonly ProjectSummary[];
    try {
      items = await store.list();
    } catch {
      return;
    }
    items = await resetOnce(items, current);
    for (const s of items) {
      if (s.status !== 'ok' || s.projectId === current || keptMarks.has(s.projectId)) continue;
      await store.remove(s.projectId);
    }
  }

  /** Remember that `project` was exported (or opened from a file) in its current exported state. */
  const rememberExport = (project: OpenProject): void => {
    if (project.exportedSignature !== null) exportMarks.set(project.meta.projectId, exportMarkOf(project.exportedSignature));
  };
  /** A restored project is "exported" when this browser remembers exporting exactly its content. */
  const withExportMark = (project: OpenProject): OpenProject => {
    const mark = exportMarks.get(project.meta.projectId);
    if (mark === null) return project;
    const signature = contentSignature(project);
    return mark === exportMarkOf(signature) ? markProjectExported(project, signature) : project;
  };

  let state: ControllerState = { project: null, save: { local: 'saved', at: '' }, notice: null, kept: false };
  /** The book of the project shown, or null (Welcome). */
  let book: Book | null = null;
  const listeners = new Set<() => void>();
  let disposed = false;
  /**
   * An open/restore/close/Save As is in progress. Leaving a project spans awaits (writing it,
   * loading the next one); every change requested meanwhile is refused with `BUSY_MESSAGE`, so no
   * edit is accepted into a book that is then dropped, and Save As copies exactly what is shown.
   */
  let transitioning = false;

  async function transition<T>(busy: T, run: () => Promise<T>): Promise<T> {
    if (transitioning) return busy;
    transitioning = true;
    try {
      return await run();
    } finally {
      transitioning = false;
    }
  }

  /** Refuse a change while transitioning (tells the user once, through the notice). */
  const refusedWhileBusy = (): boolean => {
    if (!transitioning) return false;
    if (state.notice !== BUSY_MESSAGE) setState({ notice: BUSY_MESSAGE });
    return true;
  };

  const emit = () => {
    for (const l of [...listeners]) l();
  };
  const setState = (patch: Partial<ControllerState>) => {
    state = { ...state, ...patch };
    emit();
  };

  const withLock = <T>(name: string, run: () => Promise<T>): Promise<T> => (locks ? locks.request(name, run) : run());

  /** Record a book's save state; shown when it is the open project, otherwise a failure becomes a notice. */
  function setStatus(b: Book, status: LocalSaveState) {
    b.status = status;
    if (book === b) setState({ save: status });
    else if (status.local === 'blocked') setState({ notice: `The project “${b.latest.meta.name}” could not be saved: ${status.message}` });
  }

  function cancelTimer(b: Book) {
    if (b.timer !== null) {
      scheduler.clear(b.timer);
      b.timer = null;
    }
  }

  function schedule(b: Book, delay = debounceMs) {
    if (disposed) return;
    cancelTimer(b);
    b.timer = scheduler.set(() => {
      b.timer = null;
      void write(b);
    }, delay);
  }

  /** Show `next` (a change of the open project); schedules a write when something is unsaved. */
  function update(next: OpenProject) {
    const b = book;
    if (!b || next === state.project) return;
    b.latest = next;
    const dirty = isDirty(b);
    // A blocked state stays visible until a write succeeds (never silently "Saving…" over it).
    if (dirty && b.status.local === 'saved') b.status = { local: 'pending' };
    setState({ project: next, save: b.status });
    if (dirty && !isConflicted(b)) schedule(b);
  }

  /**
   * Write `b.latest` once. Writes of one book are serialised; a request during a write is
   * chained right after it (so nothing requested is ever dropped, also after a switch or close).
   */
  function write(b: Book): Promise<void> {
    if (b.writing) {
      b.again = true;
      return b.writing;
    }
    if (!isDirty(b) || (isConflicted(b) && !b.overwrite)) return Promise.resolve();
    cancelTimer(b);
    const project = b.latest;
    const overwrite = b.overwrite;
    if (b.status.local !== 'blocked') setStatus(b, { local: 'saving' });
    const run = async () => {
      const at = now();
      const file = projectFileOf(project, at);
      if (!file.ok) {
        setStatus(b, { local: 'blocked', reason: 'error', message: `Not saved: the project is invalid (${formatProjectIssues(file.issues)}).` });
        return;
      }
      const text = serializeProjectFile(file.value);
      const outcome = await withLock(`sgl-project:${b.projectId}`, async () => {
        const stored = await store.load(b.projectId);
        if (stored.status === 'ok' && !overwrite && serializeProjectFile(stored.file) !== b.known) return { status: 'conflict' as const };
        return store.save(file.value);
      });
      b.overwrite = false;
      if (outcome.status === 'saved') {
        b.known = text;
        b.savedChanges = project.changes;
        b.latest = { ...b.latest, meta: { ...b.latest.meta, updatedAt: at } };
        if (book === b) setState({ project: b.latest });
        const clean = b.latest.changes === b.savedChanges;
        setStatus(b, clean ? { local: 'saved', at: outcome.at } : { local: 'pending' });
        if (!clean) b.again = true;
        return;
      }
      if (outcome.status === 'conflict') setStatus(b, { local: 'blocked', reason: 'conflict', message: CONFLICT_MESSAGE });
      else setStatus(b, { local: 'blocked', reason: outcome.reason, message: outcome.message });
    };
    b.writing = run()
      .catch((error: unknown) => {
        b.overwrite = false;
        setStatus(b, { local: 'blocked', reason: 'error', message: `Not saved: ${error instanceof Error ? error.message : String(error)}` });
      })
      .finally(() => {
        b.writing = null;
        if (b.again) {
          b.again = false;
          if (isDirty(b) && !isConflicted(b)) void write(b);
        }
      });
    return b.writing;
  }

  /** Wait until `b` has no write in progress (including chained ones). */
  async function settle(b: Book): Promise<void> {
    while (b.writing) await b.writing;
  }

  /** Write everything `b` still has (unless blocked by a conflict) and wait for it. */
  async function flushBook(b: Book): Promise<void> {
    cancelTimer(b);
    await settle(b);
    // Bounded: a blocked write is attempted once per flush; a conflict is never written over.
    for (let attempt = 0; attempt < 3 && isDirty(b) && !isConflicted(b); attempt++) {
      await write(b);
      await settle(b);
      if (b.status.local === 'blocked') break;
    }
  }

  /**
   * Prepare to leave the shown project: write everything it still has and wait. Returns null when
   * it may be left, or the reason it must not be left without an explicit `discard`.
   */
  async function leave(opts: LeaveOptions): Promise<string | null> {
    const b = book;
    if (!b) return null;
    await flushBook(b);
    if (book !== b || !isDirty(b) || opts.discard === true) return null;
    const why = b.status.local === 'blocked' ? ` ${b.status.message}` : '';
    return `The latest changes of “${b.latest.meta.name}” could not be saved in this browser.${why}`;
  }

  /**
   * Make `project` current with a new book; stores it at once when `known` is null (not yet stored).
   * Callers have already left the previous project (`leave`, or Save As whose copy carries its
   * changes): its book is dropped here, so no hidden write of it can land later.
   */
  function activate(project: OpenProject, known: string | null, kept = false): void {
    if (book) cancelTimer(book);
    const status: LocalSaveState = known === null ? { local: 'pending' } : { local: 'saved', at: project.meta.updatedAt };
    const b: Book = { projectId: project.meta.projectId, latest: project, known, savedChanges: known === null ? -1 : project.changes, status, writing: null, again: false, overwrite: false, timer: null };
    book = b;
    rememberExport(project);
    setState({ project, save: status, notice: null, kept });
    if (known === null) schedule(b, 0);
  }

  const mutate = (fn: (p: OpenProject) => OpenProject) => {
    if (state.project && !refusedWhileBusy()) update(fn(state.project));
  };

  const mutateOutcome = <T>(fn: (p: OpenProject) => Outcome<OpenProject>, value: (p: OpenProject) => T): Outcome<T> => {
    if (!state.project) return { ok: false, message: 'No project is open.' };
    if (refusedWhileBusy()) return { ok: false, message: BUSY_MESSAGE };
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

    open: (file, origin, opts = {}) => transition<OpenOutcome>({ ok: false, message: BUSY_MESSAGE }, async () => {
      const blocked = await leave(opts);
      if (blocked) return { ok: false, message: blocked, needsConfirmation: true };
      // An id used by the shown project or by a stored record is taken.
      const inUse = book?.projectId === file.projectId;
      const existing = inUse ? null : await store.load(file.projectId);
      const identityTaken = inUse || existing?.status === 'ok' || existing?.status === 'unreadable';
      const separate = separateIdentity(file, identityTaken, { now, newId: newProjectId, newScenarioId });
      if (!separate.ok) return { ok: false, message: `The project could not be opened: ${formatProjectIssues(separate.issues)}` };
      const project = openProject(separate.value, origin, { exported: opts.exported === true && !identityTaken });
      activate(project, null);
      await pruneUnsaved(project.meta.projectId);
      if (identityTaken) {
        setState({
          notice: `This browser already has a project with the id of “${file.name}”. The file was opened as a separate copy, so the stored project was not changed.`,
        });
      }
      return { ok: true, project };
    }),

    restore: (projectId, opts = {}) => transition<RestoreOutcome>({ ok: false, status: 'busy', message: BUSY_MESSAGE }, async () => {
      // The shown project's writes land first (also when it is this very project).
      const blocked = await leave(opts);
      if (blocked) return { ok: false, status: 'needs-confirmation', message: blocked };
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
      const project = withExportMark(openProject(loaded.file, { kind: 'restored', label: 'this browser' }));
      activate(project, serializeProjectFile(loaded.file), keptMarks.has(projectId));
      await pruneUnsaved(projectId);
      return { ok: true, project };
    }),

    close: (opts = {}) => transition(false, async () => {
      const b = book;
      if (!b) return true;
      if ((await leave(opts)) !== null) return false;
      if (book !== b) return true;
      cancelTimer(b);
      book = null;
      setState({ project: null, save: { local: 'saved', at: '' }, notice: null, kept: false });
      return true;
    }),

    async listRecent() {
      let items: readonly ProjectSummary[] = [];
      try {
        items = await store.list();
      } catch {
        items = [];
      }
      // `list()` answers [] both for "nothing stored" and "storage unusable": tell them apart.
      if (items.length === 0) {
        const probe = await store.load('sgl-storage-probe');
        if (probe.status === 'unavailable') return { status: 'unavailable', message: probe.message };
      }
      if (!keptMarks.available()) return { status: 'ok', items, unsaved: [] };
      // The last session: the shown project, otherwise the most recently saved one (list is newest first).
      items = await resetOnce(items, book?.projectId ?? items.find((s) => s.status === 'ok')?.projectId ?? null);
      return { status: 'ok', items, unsaved: items.filter((s) => s.status === 'ok' && !keptMarks.has(s.projectId)).map((s) => s.projectId) };
    },

    hasPendingWork: () => book !== null && (isDirty(book) || book.writing !== null),
    notify(message) {
      setState({ notice: message });
    },

    discardUnreadable: (projectId) => store.discardUnreadable(projectId),

    command(command) {
      if (!state.project) return { ok: false, issues: [{ path: [], code: 'not-found', message: 'no project is open' }] };
      if (refusedWhileBusy()) return { ok: false, issues: [{ path: [], code: 'not-found', message: BUSY_MESSAGE }] };
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
    setCalculatedFields(ids) {
      mutate((p) => setCalculatedFields(p, ids));
    },
    setShownAnalyses(ids) {
      mutate((p) => setShownAnalyses(p, ids));
    },
    setFunctions(functions, hiddenFunctions) {
      mutate((p) => setProjectFunctions(p, functions, hiddenFunctions));
    },
    setAttributeRecord(record) {
      mutate((p) => setAttributeRecord(p, record));
    },
    addFacadeAsset: (asset) => mutateOutcome((p) => addFacadeAsset(p, asset), () => undefined),
    removeFacadeAsset: (assetId, options) => mutateOutcome((p) => removeFacadeAsset(p, assetId, options), () => undefined),
    facadeUses: (assetId) => (state.project ? facadeUses(state.project, assetId) : []),
    renameFacadeAsset: (assetId, name) => mutateOutcome((p) => renameFacadeAsset(p, assetId, name), () => undefined),
    setFacadeAssetMaterials: (assetId, materials, role) => mutateOutcome((p) => setFacadeAssetMaterials(p, assetId, materials, role), () => undefined),

    exportFile() {
      const project = state.project;
      if (!project) return { ok: false, message: 'No project is open.' };
      const file = projectFileOf(project, now());
      if (!file.ok) return { ok: false, message: `The project could not be exported: ${formatProjectIssues(file.issues)}` };
      return { ok: true, value: { file: file.value, text: serializeProjectFile(file.value), signature: contentSignature(project) } };
    },
    markExported(signature) {
      // Export bookkeeping only: not a change to save. Remembered in this browser beside the
      // stored record (never inside the project file), so a restored project still shows it.
      if (!state.project || !book) return;
      book.latest = markProjectExported(state.project, signature);
      rememberExport(book.latest);
      setState({ project: book.latest });
    },

    saveAs: (name) => transition<Outcome<OpenProject>>({ ok: false, message: BUSY_MESSAGE }, async () => {
      if (!state.project) return { ok: false, message: 'No project is open.' };
      // A write of the original already running finishes first. No change can arrive meanwhile
      // (transition), and the copy is built from the state shown NOW, after the wait.
      const original = book;
      if (original) {
        cancelTimer(original);
        await settle(original);
      }
      const project = state.project;
      if (!project) return { ok: false, message: 'No project is open.' };
      const copy = saveProjectAs(project, name, { now, newId: newProjectId, newScenarioId });
      if (!copy.ok) return copy;
      // Save as new project is an explicit save: the copy is kept.
      keptMarks.add(copy.value.meta.projectId);
      activate(copy.value, null, true);
      await pruneUnsaved(copy.value.meta.projectId);
      return copy;
    }),

    async saveLocally() {
      const b = book;
      if (!b || !state.project) return { ok: false, message: 'No project is open.' };
      if (!keptMarks.available()) return { ok: false, message: 'This browser does not allow saving: its local storage is not available. Export the project to keep it.' };
      keptMarks.add(b.projectId);
      if (book === b) setState({ kept: true });
      await flushBook(b);
      return { ok: true, value: undefined };
    },

    async flush() {
      if (book) await flushBook(book);
    },
    async retrySave() {
      const b = book;
      if (!b || isConflicted(b)) return;
      await settle(b);
      await write(b);
      await settle(b);
    },
    async overwriteStored() {
      const b = book;
      if (!b) return;
      await settle(b);
      b.overwrite = true;
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
