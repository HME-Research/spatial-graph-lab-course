import { useEffect, useState } from 'react';
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOADED_ANALYSES,
  MAX_UPLOAD_FILE_NAME,
  notTypeScriptProblem,
  prepareUpload,
  tooLargeProblem,
  uploadLanguage,
  type AnalysisUses,
  type StoredUpload,
  type UploadedDefinition,
  type UploadKind,
  type UploadRunner,
  type UploadStatus,
} from '@app/extensions';
import { designNeeds, type UploadedAnalysisEntry } from './analyseModel';

/**
 * The student's uploaded analyses in the Analyse tab (P4 item I): preparing (compile + load in a
 * worker + validate) each stored upload once per source text, and checking a new upload before it
 * is added to the project (`settings.uploadedAnalyses`). The generic parts (`cachedPreparer`,
 * `usePreparedUploads`, `addStoredUpload`) also serve uploaded transforms (2026-11-25,
 * `app/session/transformUploads.ts`).
 */

const MAX_CACHED = 60;

const cacheKey = (fileName: string, source: string) => `${fileName}\u0000${source}`;

/** A preparation step (compile + load + validate) that fails with readable problems, never throws. */
type Prepare<S> = (source: string, fileName: string, runner?: UploadRunner) => Promise<S>;

/** `prepare` with a cache by file name + source text (the same text is compiled and loaded once per page). */
export function cachedPreparer<S>(prepare: Prepare<S>, failed: (problems: readonly string[]) => S): Prepare<S> {
  const prepared = new Map<string, Promise<S>>();
  return (source, fileName, runner) => {
    const key = cacheKey(fileName, source);
    let promise = prepared.get(key);
    if (!promise) {
      promise = prepare(source, fileName, runner).catch((error: unknown) => failed([String(error)]));
      prepared.set(key, promise);
      if (prepared.size > MAX_CACHED) prepared.delete(prepared.keys().next().value!);
    }
    return promise;
  };
}

export const prepareCached: Prepare<UploadStatus> = cachedPreparer<UploadStatus>(prepareUpload, (problems) => ({ ok: false, problems }));

/** A stored upload with its preparation status (`loading` until its worker has answered). */
export interface PreparedUpload<S> {
  readonly stored: StoredUpload;
  readonly status: S | 'loading';
}

/** A stored analysis with its preparation status. */
export type LoadedUpload = PreparedUpload<UploadStatus>;

/**
 * Prepare every stored upload (asynchronously, in workers). A stored upload that no longer
 * compiles or validates gets a failed status with the reason; it never blocks the project.
 */
export function usePreparedUploads<S>(stored: readonly StoredUpload[], prepare: Prepare<S>): readonly PreparedUpload<S>[] {
  const [statuses, setStatuses] = useState<ReadonlyMap<string, S>>(() => new Map());
  useEffect(() => {
    let live = true;
    for (const upload of stored) {
      const key = cacheKey(upload.fileName, upload.source);
      if (statuses.has(key)) continue;
      void prepare(upload.source, upload.fileName).then((status) => {
        if (live) setStatuses((current) => (current.has(key) ? current : new Map(current).set(key, status)));
      });
    }
    return () => {
      live = false;
    };
    // `statuses` only short-cuts work already done; a new list of uploads is what starts preparing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored]);
  return stored.map((upload) => ({ stored: upload, status: statuses.get(cacheKey(upload.fileName, upload.source)) ?? 'loading' }));
}

/** Prepare every stored analysis (`usePreparedUploads` with `prepareCached`). */
export const useUploadedAnalyses = (stored: readonly StoredUpload[]): readonly LoadedUpload[] => usePreparedUploads(stored, prepareCached);

/** A new upload id, unique among `existing`. */
export function newUploadId(existing: readonly StoredUpload[], now: number = Date.now()): string {
  const taken = new Set(existing.map((u) => u.id));
  for (let n = 0; ; n++) {
    const id = `upload-${now.toString(36)}${n === 0 ? '' : `-${n}`}`;
    if (!taken.has(id)) return id;
  }
}

/** File name as stored (no folders, at most `MAX_UPLOAD_FILE_NAME` characters). */
export const storedFileName = (name: string, fallback = 'analysis.ts') => (name.split(/[\\/]/).pop() ?? name).slice(-MAX_UPLOAD_FILE_NAME) || fallback;

/** What `addStoredUpload` needs to know about one kind of upload. */
export interface UploadSurface<S> {
  readonly kind: UploadKind;
  /** At most this many uploads of this kind per project. */
  readonly max: number;
  readonly prepare: Prepare<S>;
}

type PreparedStatus = { readonly ok: true; readonly definition: { readonly id: string; readonly label: string } } | { readonly ok: false; readonly problems: readonly string[] };

const PLURAL: Readonly<Record<UploadKind, string>> = { analysis: 'analyses', transform: 'transforms' };
const ARTICLE: Readonly<Record<UploadKind, string>> = { analysis: 'an analysis', transform: 'a transform' };

export type StoredUploadCheck<D> = { readonly ok: true; readonly uploads: readonly StoredUpload[]; readonly definition: D } | { readonly ok: false; readonly problems: readonly string[] };

/**
 * Check a chosen file and return the new list of uploads: appended, or in place of `replaceId`
 * (Replace keeps its place and id). Refused with readable problems: wrong extension, too large,
 * does not compile, refused import, invalid definition, timeout, the same id as another upload of
 * this kind, or too many uploads.
 */
export async function addStoredUpload<S extends PreparedStatus>(
  surface: UploadSurface<S>,
  file: { readonly name: string; readonly size: number; text(): Promise<string> },
  current: readonly PreparedUpload<S>[],
  replaceId: string | null,
  options: { readonly now?: Date; readonly runner?: UploadRunner } = {},
): Promise<StoredUploadCheck<Extract<S, { ok: true }>['definition']>> {
  const { kind } = surface;
  const fileName = storedFileName(file.name, `${kind}.ts`);
  if (uploadLanguage(fileName) === null) return { ok: false, problems: [notTypeScriptProblem(fileName, kind)] };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, problems: [tooLargeProblem(fileName, file.size, kind)] };
  if (replaceId === null && current.length >= surface.max) {
    return { ok: false, problems: [`A project can hold at most ${surface.max} uploaded ${PLURAL[kind]}. Remove one first.`] };
  }
  let source: string;
  try {
    source = await file.text();
  } catch {
    return { ok: false, problems: [`"${fileName}" could not be read.`] };
  }
  const status = await surface.prepare(source, fileName, options.runner);
  if (!status.ok) return { ok: false, problems: status.problems };
  const id = status.definition.id;
  const clash = current.find((u) => u.stored.id !== replaceId && u.status !== 'loading' && u.status.ok && u.status.definition.id === id);
  if (clash) {
    return {
      ok: false,
      problems: [`You already uploaded ${ARTICLE[kind]} with the id "${id}" (${clash.stored.fileName}). Use Replace on it, or give this one another id.`],
    };
  }
  const stored = current.map((u) => u.stored);
  const entry: StoredUpload = {
    id: replaceId ?? newUploadId(stored, (options.now ?? new Date()).getTime()),
    fileName,
    source,
    addedAt: (options.now ?? new Date()).toISOString(),
  };
  const uploads = replaceId === null ? [...stored, entry] : stored.map((u) => (u.id === replaceId ? entry : u));
  return { ok: true, uploads, definition: status.definition as Extract<S, { ok: true }>['definition'] };
}

export type UploadCheck = StoredUploadCheck<UploadedDefinition>;

const ANALYSIS_SURFACE: UploadSurface<UploadStatus> = { kind: 'analysis', max: MAX_UPLOADED_ANALYSES, prepare: prepareCached };

/** Check a chosen analysis file (`addStoredUpload` for Analyse). */
export const addUpload = (
  file: { readonly name: string; readonly size: number; text(): Promise<string> },
  current: readonly LoadedUpload[],
  replaceId: string | null,
  options: { readonly now?: Date; readonly runner?: UploadRunner } = {},
): Promise<UploadCheck> => addStoredUpload(ANALYSIS_SURFACE, file, current, replaceId, options);

/**
 * The panel's view of the uploads: a loading or failed upload is listed disabled (in Network) with
 * its reason. A design analysis is also disabled, in its own section, when the open project lacks
 * something its `uses` names (`missing`, e.g. `missingUses` against the project).
 */
export function uploadEntries(loaded: readonly LoadedUpload[], missing: (uses: AnalysisUses | undefined) => readonly string[] = () => []): UploadedAnalysisEntry[] {
  return loaded.map(({ stored, status }) => {
    if (status === 'loading') return { uploadId: stored.id, label: stored.fileName, inputs: [], enabled: false, problems: ['Loading…'] };
    if (!status.ok) return { uploadId: stored.id, label: stored.fileName, inputs: [], enabled: false, problems: status.problems };
    const { definition } = status;
    if (definition.scope !== 'design') return { uploadId: stored.id, label: definition.label, inputs: definition.inputs, enabled: true, problems: [] };
    const problems = missing(definition.uses);
    return { uploadId: stored.id, label: definition.label, inputs: definition.inputs, enabled: problems.length === 0, problems, design: designNeeds(definition.uses) };
  });
}
