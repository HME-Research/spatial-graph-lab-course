import { useEffect, useState } from 'react';
import {
  formatUploadSize,
  MAX_UPLOAD_BYTES,
  MAX_UPLOADED_ANALYSES,
  MAX_UPLOAD_FILE_NAME,
  prepareUpload,
  uploadLanguage,
  type StoredUpload,
  type UploadedDefinition,
  type UploadRunner,
  type UploadStatus,
} from '@app/extensions';
import type { UploadedAnalysisEntry } from './analyseModel';

/**
 * The student's uploaded analyses in the Analyse tab (P4 item I): preparing (compile + load in a
 * worker + validate) each stored upload once per source text, and checking a new upload before it
 * is added to the project (`settings.uploadedAnalyses`).
 */

/** Prepared uploads by file name + source text (the same text is compiled and loaded once per page). */
const prepared = new Map<string, Promise<UploadStatus>>();
const MAX_CACHED = 60;

const cacheKey = (fileName: string, source: string) => `${fileName}\u0000${source}`;

export function prepareCached(source: string, fileName: string, runner?: UploadRunner): Promise<UploadStatus> {
  const key = cacheKey(fileName, source);
  let promise = prepared.get(key);
  if (!promise) {
    promise = prepareUpload(source, fileName, runner).catch((error: unknown) => ({ ok: false as const, problems: [String(error)] }));
    prepared.set(key, promise);
    if (prepared.size > MAX_CACHED) prepared.delete(prepared.keys().next().value!);
  }
  return promise;
}

/** A stored upload with its preparation status (`loading` until its worker has answered). */
export interface LoadedUpload {
  readonly stored: StoredUpload;
  readonly status: UploadStatus | 'loading';
}

/**
 * Prepare every stored upload (asynchronously, in workers). A stored analysis that no longer
 * compiles or validates gets a failed status with the reason; it never blocks the project.
 */
export function useUploadedAnalyses(stored: readonly StoredUpload[]): readonly LoadedUpload[] {
  const [statuses, setStatuses] = useState<ReadonlyMap<string, UploadStatus>>(() => new Map());
  useEffect(() => {
    let live = true;
    for (const upload of stored) {
      const key = cacheKey(upload.fileName, upload.source);
      if (statuses.has(key)) continue;
      void prepareCached(upload.source, upload.fileName).then((status) => {
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

/** A new upload id, unique among `existing`. */
export function newUploadId(existing: readonly StoredUpload[], now: number = Date.now()): string {
  const taken = new Set(existing.map((u) => u.id));
  for (let n = 0; ; n++) {
    const id = `upload-${now.toString(36)}${n === 0 ? '' : `-${n}`}`;
    if (!taken.has(id)) return id;
  }
}

/** File name as stored (no folders, at most `MAX_UPLOAD_FILE_NAME` characters). */
export const storedFileName = (name: string) => (name.split(/[\\/]/).pop() ?? name).slice(-MAX_UPLOAD_FILE_NAME) || 'analysis.ts';

export type UploadCheck = { readonly ok: true; readonly uploads: readonly StoredUpload[]; readonly definition: UploadedDefinition } | { readonly ok: false; readonly problems: readonly string[] };

/**
 * Check a chosen file and return the new list of uploads: appended, or in place of `replaceId`
 * (Replace keeps its place and id). Refused with readable problems: wrong extension, too large,
 * does not compile, refused import, invalid definition or result shape, timeout, the same analysis
 * id as another upload, or too many uploads.
 */
export async function addUpload(
  file: { readonly name: string; readonly size: number; text(): Promise<string> },
  current: readonly LoadedUpload[],
  replaceId: string | null,
  options: { readonly now?: Date; readonly runner?: UploadRunner } = {},
): Promise<UploadCheck> {
  const fileName = storedFileName(file.name);
  if (uploadLanguage(fileName) === null) return { ok: false, problems: [`"${fileName}" is not a .ts or .js file. Upload the analysis as a .ts file.`] };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, problems: [`"${fileName}" is ${formatUploadSize(file.size)}; an uploaded analysis may be at most ${formatUploadSize(MAX_UPLOAD_BYTES)}.`] };
  if (replaceId === null && current.length >= MAX_UPLOADED_ANALYSES) {
    return { ok: false, problems: [`A project can hold at most ${MAX_UPLOADED_ANALYSES} uploaded analyses. Remove one first.`] };
  }
  let source: string;
  try {
    source = await file.text();
  } catch {
    return { ok: false, problems: [`"${fileName}" could not be read.`] };
  }
  const status = await prepareCached(source, fileName, options.runner);
  if (!status.ok) return status;
  const clash = current.find((u) => u.stored.id !== replaceId && u.status !== 'loading' && u.status.ok && u.status.definition.id === status.definition.id);
  if (clash) {
    return {
      ok: false,
      problems: [`You already uploaded an analysis with the id "${status.definition.id}" (${clash.stored.fileName}). Use Replace on it, or give this one another id.`],
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
  return { ok: true, uploads, definition: status.definition };
}

/** The panel's view of the uploads: a loading or failed upload is listed disabled (in Network) with its reason. */
export function uploadEntries(loaded: readonly LoadedUpload[]): UploadedAnalysisEntry[] {
  return loaded.map(({ stored, status }) => {
    if (status === 'loading') return { uploadId: stored.id, label: stored.fileName, inputs: [], enabled: false, problems: ['Loading…'] };
    if (!status.ok) return { uploadId: stored.id, label: stored.fileName, inputs: [], enabled: false, problems: status.problems };
    return { uploadId: stored.id, label: status.definition.label, inputs: status.definition.inputs, enabled: true, problems: [] };
  });
}
