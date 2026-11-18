import { formatProjectIssues, nowIso, readProjectFile, serializeProjectFile, type ProjectFileV2, type ProjectIssue } from './projectFile';

/**
 * Local project storage (Gate F, F-B; root-owned).
 *
 * One record per project: key = `projectId`, value = the canonical project-file text. All policy
 * lives in `createRecordProjectStore` and is shared by the in-memory store (tests) and the
 * IndexedDB store (browser); the backends only move values.
 *
 * - **Never overwrite what cannot be read.** A stored record that is not a valid project file (or
 *   belongs to another id) is copied to quarantine under `<id>:unreadable:<ts>` (an existing
 *   quarantine key is never reused; an identical copy is not duplicated). A save over it returns
 *   `blocked/refused-unreadable` until `discardUnreadable(id)` is called explicitly; discarding
 *   keeps the quarantine copy.
 * - **Failures are reported, never thrown.** Quota (`QuotaExceededError`) → `blocked/quota`;
 *   no IndexedDB (or it cannot be opened) → `blocked/unavailable`; anything else → `blocked/error`.
 * - `list()` = readable projects sorted by `updatedAt` (newest first), then unreadable records.
 *
 * Only the IndexedDB adapter touches browser APIs, through an injected `IDBFactory`.
 */

export type ProjectSummary =
  | {
      readonly status: 'ok';
      readonly projectId: string;
      readonly name: string;
      readonly description?: string | undefined;
      readonly createdAt: string;
      readonly updatedAt: string;
      readonly scenarioCount: number;
      readonly toolkitId: string | null;
    }
  | { readonly status: 'unreadable'; readonly projectId: string; readonly quarantineKey: string | null; readonly issues: readonly ProjectIssue[] };

export type LoadResult =
  | { readonly status: 'ok'; readonly file: ProjectFileV2 }
  | { readonly status: 'missing' }
  /** `quarantineKey` is null only when the copy could not be written (the record itself is untouched). */
  | { readonly status: 'unreadable'; readonly quarantineKey: string | null; readonly issues: readonly ProjectIssue[] }
  /** Additive to the F-B shape: storage itself cannot be used. */
  | { readonly status: 'unavailable'; readonly message: string };

export type SaveBlockReason = 'quota' | 'unavailable' | 'refused-unreadable' | 'error';

export type SaveResult =
  | { readonly status: 'saved'; readonly at: string }
  | { readonly status: 'blocked'; readonly reason: SaveBlockReason; readonly message: string };

export type DiscardResult =
  | { readonly status: 'discarded'; readonly quarantineKey: string }
  /** Nothing to discard: missing or readable (a readable record is never deleted here). */
  | { readonly status: 'not-unreadable' }
  | { readonly status: 'blocked'; readonly reason: SaveBlockReason; readonly message: string };

export interface ProjectStore {
  list(): Promise<ProjectSummary[]>;
  load(projectId: string): Promise<LoadResult>;
  save(file: ProjectFileV2): Promise<SaveResult>;
  /** Explicit user decision: delete an unreadable record (its quarantine copy is kept). */
  discardUnreadable(projectId: string): Promise<DiscardResult>;
  /**
   * Remove a READABLE stored project (additive, 2026-11-17): used only for a session the user did
   * not save locally, when another project becomes the last session. An unreadable record is never
   * removed here (`not-readable`); it stays until `discardUnreadable`.
   */
  remove(projectId: string): Promise<RemoveResult>;
}

export type RemoveResult =
  | { readonly status: 'removed' }
  | { readonly status: 'missing' }
  | { readonly status: 'not-readable' }
  | { readonly status: 'blocked'; readonly message: string };

// ---------------------------------------------------------------------------------------------
// Shared policy over a minimal backend

/** Thrown by a backend when storage cannot be used at all. */
export class StoreUnavailableError extends Error {
  override readonly name = 'StoreUnavailableError';
}

/** What a storage backend must offer. Values are opaque (normally strings). */
export interface RecordBackend {
  getProject(id: string): Promise<unknown>;
  allProjects(): Promise<Array<readonly [string, unknown]>>;
  putProject(id: string, text: string): Promise<void>;
  deleteProject(id: string): Promise<void>;
  allQuarantine(): Promise<Array<readonly [string, unknown]>>;
  /** Must fail rather than overwrite an existing key. */
  addQuarantine(key: string, value: unknown): Promise<void>;
}

export const quarantinePrefix = (projectId: string): string => `${projectId}:unreadable:`;

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function isQuotaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { name?: unknown; code?: unknown };
  return e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22;
}

function blocked(error: unknown): { readonly status: 'blocked'; readonly reason: SaveBlockReason; readonly message: string } {
  if (error instanceof StoreUnavailableError) return { status: 'blocked', reason: 'unavailable', message: `local storage is not available: ${error.message}` };
  if (isQuotaError(error)) return { status: 'blocked', reason: 'quota', message: `not saved: the browser's storage quota is full (${messageOf(error)})` };
  return { status: 'blocked', reason: 'error', message: `not saved: ${messageOf(error)}` };
}

function readStored(id: string, value: unknown): { ok: true; file: ProjectFileV2 } | { ok: false; issues: readonly ProjectIssue[] } {
  if (typeof value !== 'string') return { ok: false, issues: [{ path: [], code: 'invalid-json', message: 'the stored record is not text' }] };
  const read = readProjectFile(value);
  if (!read.ok) return { ok: false, issues: read.issues };
  if (read.value.projectId !== id) {
    return { ok: false, issues: [{ path: ['projectId'], code: 'schema', message: `the stored record belongs to project "${read.value.projectId}", not "${id}"` }] };
  }
  return { ok: true, file: read.value };
}

export interface RecordStoreOptions {
  /** Clock for save times and quarantine keys. */
  readonly now?: () => string;
}

/** The storage policy over any backend. */
export function createRecordProjectStore(backend: RecordBackend, options: RecordStoreOptions = {}): ProjectStore {
  const now = options.now ?? nowIso;

  /** Copy `value` to quarantine (once per identical value). Returns the key, or null when it could not be written. */
  async function quarantine(id: string, value: unknown): Promise<string | null> {
    try {
      const prefix = quarantinePrefix(id);
      const existing = (await backend.allQuarantine()).filter(([k]) => k.startsWith(prefix));
      const same = existing.find(([, v]) => v === value);
      if (same) return same[0];
      const taken = new Set(existing.map(([k]) => k));
      const base = `${prefix}${now()}`;
      let key = base;
      for (let n = 2; taken.has(key); n++) key = `${base}-${n}`;
      await backend.addQuarantine(key, value);
      return key;
    } catch {
      return null;
    }
  }

  return {
    async list() {
      let rows: Array<readonly [string, unknown]>;
      try {
        rows = await backend.allProjects();
      } catch {
        return [];
      }
      const ok: Extract<ProjectSummary, { status: 'ok' }>[] = [];
      const bad: ProjectSummary[] = [];
      for (const [id, value] of rows) {
        const read = readStored(id, value);
        if (read.ok) {
          const f = read.file;
          ok.push({
            status: 'ok',
            projectId: f.projectId,
            name: f.name,
            ...(f.description !== undefined && { description: f.description }),
            createdAt: f.createdAt,
            updatedAt: f.updatedAt,
            scenarioCount: f.scenarios.length,
            toolkitId: f.toolkit?.id ?? null,
          });
        } else {
          bad.push({ status: 'unreadable', projectId: id, quarantineKey: await quarantine(id, value), issues: read.issues });
        }
      }
      ok.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.projectId.localeCompare(b.projectId));
      bad.sort((a, b) => a.projectId.localeCompare(b.projectId));
      return [...ok, ...bad];
    },

    async load(projectId) {
      let value: unknown;
      try {
        value = await backend.getProject(projectId);
      } catch (error) {
        return { status: 'unavailable', message: messageOf(error) };
      }
      if (value === undefined) return { status: 'missing' };
      const read = readStored(projectId, value);
      if (read.ok) return { status: 'ok', file: read.file };
      return { status: 'unreadable', quarantineKey: await quarantine(projectId, value), issues: read.issues };
    },

    async save(file) {
      const valid = readProjectFile(serializeProjectFile(file));
      if (!valid.ok) return { status: 'blocked', reason: 'error', message: `not saved: the project is invalid (${formatProjectIssues(valid.issues)})` };
      try {
        const existing = await backend.getProject(file.projectId);
        if (existing !== undefined && !readStored(file.projectId, existing).ok) {
          const key = await quarantine(file.projectId, existing);
          return {
            status: 'blocked',
            reason: 'refused-unreadable',
            message: `not saved: the stored copy of this project cannot be read and is never overwritten${key ? ` (a copy is kept under "${key}")` : ''}; discard it explicitly to save`,
          };
        }
        await backend.putProject(file.projectId, serializeProjectFile(valid.value));
        return { status: 'saved', at: now() };
      } catch (error) {
        return blocked(error);
      }
    },

    async discardUnreadable(projectId) {
      try {
        const existing = await backend.getProject(projectId);
        if (existing === undefined || readStored(projectId, existing).ok) return { status: 'not-unreadable' };
        const key = await quarantine(projectId, existing);
        if (key === null) return { status: 'blocked', reason: 'error', message: 'not discarded: a copy of the unreadable record could not be kept' };
        await backend.deleteProject(projectId);
        return { status: 'discarded', quarantineKey: key };
      } catch (error) {
        return blocked(error);
      }
    },
    async remove(projectId) {
      try {
        const existing = await backend.getProject(projectId);
        if (existing === undefined) return { status: 'missing' };
        if (!readStored(projectId, existing).ok) return { status: 'not-readable' };
        await backend.deleteProject(projectId);
        return { status: 'removed' };
      } catch (error) {
        return { status: 'blocked', message: messageOf(error) };
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Export marks (additive, I1 audit repair): local bookkeeping beside the stored records

/**
 * "This project was exported in this state", remembered in this browser beside the stored record
 * so that a restored project still knows it. Never part of a project file (exporting does not
 * change what is exported). A mark is a digest of the exported content signature: it only counts
 * while the project's content still has that signature (any later edit makes it stale).
 * Both operations are best effort and never throw.
 */
export interface ExportMarks {
  get(projectId: string): string | null;
  set(projectId: string, mark: string): void;
}

/** Digest of a content signature (two 53-bit string hashes + length; the signature itself may be large). */
export function exportMarkOf(signature: string): string {
  const hash = (seed: number): number => {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < signature.length; i++) {
      const ch = signature.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  };
  return `v1:${signature.length}:${hash(1).toString(36)}:${hash(2).toString(36)}`;
}

export const EXPORT_MARK_PREFIX = 'sgl-exported:';

// ---------------------------------------------------------------------------------------------
// Saved-locally marks (additive, 2026-11-17): which stored projects the user chose to keep

/**
 * Only the LAST session is autosaved without asking; any other project stays in this browser only
 * once the user saved it locally (Save locally, or Save as new project). These marks remember that
 * choice beside the stored records (never in a project file). On first use (`initialised` false)
 * the controller runs a one-time reset: every mark is cleared (`clear`) and every readable stored
 * project except the last session is removed, so earlier projects (including ones adopted as saved
 * by the first version of these marks) no longer pile up. When the marks cannot be used
 * (`available()` false), nothing is ever removed.
 */
export interface KeptMarks {
  available(): boolean;
  /** The one-time reset has run in this browser. */
  initialised(): boolean;
  setInitialised(): void;
  has(projectId: string): boolean;
  add(projectId: string): void;
  /** Forget every saved-locally mark (used only by the one-time reset). */
  clear(): void;
}

export const KEPT_MARK_PREFIX = 'sgl-kept:';
/** Set once the one-time reset ran. A new key, so browsers that adopted earlier projects are reset too. */
export const KEPT_MARKS_INITIALISED = 'sgl-kept-reset-1';
/** The first version's marker (earlier projects were adopted as saved); removed by `clear`. */
const LEGACY_KEPT_MARKS_INITIALISED = 'sgl-kept-initialised';

export function createMemoryKeptMarks(initialised = true): KeptMarks & { readonly kept: Set<string> } {
  const kept = new Set<string>();
  let init = initialised;
  return {
    kept,
    available: () => true,
    initialised: () => init,
    setInitialised: () => void (init = true),
    has: (id) => kept.has(id),
    add: (id) => void kept.add(id),
    clear: () => kept.clear(),
  };
}

type MarkStorage = Pick<Storage, 'getItem' | 'setItem'> & Partial<Pick<Storage, 'removeItem' | 'key' | 'length'>>;

export function createLocalStorageKeptMarks(storage?: MarkStorage | null): KeptMarks {
  const target = (): MarkStorage | null => {
    if (storage !== undefined) return storage;
    try {
      return (globalThis as { localStorage?: Storage }).localStorage ?? null;
    } catch {
      return null;
    }
  };
  const get = (key: string): string | null => {
    try {
      return target()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const set = (key: string): boolean => {
    try {
      const t = target();
      if (!t) return false;
      t.setItem(key, '1');
      return t.getItem(key) === '1';
    } catch {
      return false;
    }
  };
  return {
    available: () => set('sgl-kept-probe'),
    initialised: () => get(KEPT_MARKS_INITIALISED) === '1',
    setInitialised: () => void set(KEPT_MARKS_INITIALISED),
    has: (id) => get(`${KEPT_MARK_PREFIX}${id}`) === '1',
    add: (id) => void set(`${KEPT_MARK_PREFIX}${id}`),
    clear: () => {
      try {
        const t = target();
        if (!t?.removeItem || !t.key || t.length === undefined) return;
        const keys: string[] = [];
        for (let i = 0; i < t.length; i++) {
          const k = t.key(i);
          if (k !== null && (k.startsWith(KEPT_MARK_PREFIX) || k === LEGACY_KEPT_MARKS_INITIALISED)) keys.push(k);
        }
        for (const k of keys) t.removeItem(k);
      } catch {
        // Best effort: a mark that cannot be removed only keeps that project stored.
      }
    },
  };
}

export function createMemoryExportMarks(): ExportMarks & { readonly marks: Map<string, string> } {
  const marks = new Map<string, string>();
  return { marks, get: (id) => marks.get(id) ?? null, set: (id, mark) => void marks.set(id, mark) };
}

/** Export marks in `localStorage` (default: the browser's; absent or failing → no marks, nothing thrown). */
export function createLocalStorageExportMarks(storage?: Pick<Storage, 'getItem' | 'setItem'> | null): ExportMarks {
  const target = (): Pick<Storage, 'getItem' | 'setItem'> | null => {
    if (storage !== undefined) return storage;
    try {
      return (globalThis as { localStorage?: Storage }).localStorage ?? null;
    } catch {
      return null;
    }
  };
  return {
    get(id) {
      try {
        return target()?.getItem(`${EXPORT_MARK_PREFIX}${id}`) ?? null;
      } catch {
        return null;
      }
    },
    set(id, mark) {
      try {
        target()?.setItem(`${EXPORT_MARK_PREFIX}${id}`, mark);
      } catch {
        // best effort: the project simply shows "not exported" after a restore
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------
// In-memory store (tests)

export interface MemoryProjectStoreOptions extends RecordStoreOptions {
  /** Total characters the project records may use (quarantine excluded); exceeding it → `QuotaExceededError`. */
  readonly quotaBytes?: number;
}

export interface MemoryProjectStore extends ProjectStore {
  /** Raw records (tests may plant corrupt values). */
  readonly records: Map<string, unknown>;
  readonly quarantined: Map<string, unknown>;
}

const quotaError = (): Error => Object.assign(new Error('quota exceeded'), { name: 'QuotaExceededError' });

export function createMemoryProjectStore(options: MemoryProjectStoreOptions = {}): MemoryProjectStore {
  const records = new Map<string, unknown>();
  const quarantined = new Map<string, unknown>();
  const size = (except: string) => [...records].reduce((n, [k, v]) => (k === except ? n : n + (typeof v === 'string' ? v.length : 0)), 0);
  const backend: RecordBackend = {
    getProject: async (id) => records.get(id),
    allProjects: async () => [...records],
    putProject: async (id, text) => {
      if (options.quotaBytes !== undefined && size(id) + text.length > options.quotaBytes) throw quotaError();
      records.set(id, text);
    },
    deleteProject: async (id) => {
      records.delete(id);
    },
    allQuarantine: async () => [...quarantined],
    addQuarantine: async (key, value) => {
      if (quarantined.has(key)) throw new Error(`quarantine key "${key}" exists`);
      quarantined.set(key, value);
    },
  };
  return { ...createRecordProjectStore(backend, options), records, quarantined };
}

// ---------------------------------------------------------------------------------------------
// IndexedDB store (browser)

export const PROJECT_DB_NAME = 'sgl-projects';
export const PROJECTS_STORE = 'projects';
export const QUARANTINE_STORE = 'quarantine';
const DB_VERSION = 1;

/** The part of the IndexedDB API used here (injectable). */
export type ProjectDbFactory = Pick<IDBFactory, 'open'>;

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });

/** Resolves when the transaction completes; rejects with its error (e.g. QuotaExceededError) on abort. */
const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  });

function defaultFactory(): ProjectDbFactory | null {
  try {
    return (globalThis as { indexedDB?: IDBFactory }).indexedDB ?? null;
  } catch {
    return null;
  }
}

export interface IndexedDbProjectStoreOptions extends RecordStoreOptions {
  /** Default: `globalThis.indexedDB` (null/absent → every save is `blocked/unavailable`). */
  readonly factory?: ProjectDbFactory | null;
}

export function createIndexedDbProjectStore(dbName: string = PROJECT_DB_NAME, options: IndexedDbProjectStoreOptions = {}): ProjectStore {
  const factory = options.factory === undefined ? defaultFactory() : options.factory;
  let opening: Promise<IDBDatabase> | null = null;

  function open(): Promise<IDBDatabase> {
    if (!factory) return Promise.reject(new StoreUnavailableError('IndexedDB is not available in this browser'));
    if (opening) return opening;
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      let req: IDBOpenDBRequest;
      try {
        req = factory.open(dbName, DB_VERSION);
      } catch (error) {
        reject(new StoreUnavailableError(messageOf(error)));
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(PROJECTS_STORE)) db.createObjectStore(PROJECTS_STORE);
        if (!db.objectStoreNames.contains(QUARANTINE_STORE)) db.createObjectStore(QUARANTINE_STORE);
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          opening = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(new StoreUnavailableError(messageOf(req.error ?? 'IndexedDB could not be opened')));
      req.onblocked = () => reject(new StoreUnavailableError('IndexedDB is blocked by another open tab'));
    });
    opening.catch(() => {
      opening = null;
    });
    return opening;
  }

  async function entries(storeName: string): Promise<Array<readonly [string, unknown]>> {
    const db = await open();
    const store = db.transaction(storeName, 'readonly').objectStore(storeName);
    const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())]);
    return keys.map((k, i) => [String(k), values[i]] as const);
  }

  async function write(storeName: string, action: (store: IDBObjectStore) => IDBRequest): Promise<void> {
    const db = await open();
    const tx = db.transaction(storeName, 'readwrite');
    const finished = done(tx);
    try {
      action(tx.objectStore(storeName));
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // already finished
      }
      finished.catch(() => undefined);
      throw error;
    }
    await finished;
  }

  const backend: RecordBackend = {
    getProject: async (id) => {
      const db = await open();
      return request(db.transaction(PROJECTS_STORE, 'readonly').objectStore(PROJECTS_STORE).get(id));
    },
    allProjects: () => entries(PROJECTS_STORE),
    putProject: (id, text) => write(PROJECTS_STORE, (s) => s.put(text, id)),
    deleteProject: (id) => write(PROJECTS_STORE, (s) => s.delete(id)),
    allQuarantine: () => entries(QUARANTINE_STORE),
    addQuarantine: (key, value) => write(QUARANTINE_STORE, (s) => s.add(value, key)),
  };
  return createRecordProjectStore(backend, options);
}
