import {
  MAX_UPLOADED_TRANSFORMS,
  prepareTransformUpload,
  type StoredUpload,
  type TransformUploadStatus,
  type UploadedTransformDefinition,
  type UploadRunner,
} from '@app/extensions';
import { addStoredUpload, cachedPreparer, usePreparedUploads, type PreparedUpload, type StoredUploadCheck, type UploadSurface } from '@app/analysis/uploads';
import type { AlgorithmEntry } from './algorithmSession';

/**
 * The student's uploaded transforms in the Transform tab (owner 2026-11-25), mirroring uploaded
 * analyses: each stored upload (`settings.uploadedTransforms`) is prepared (compile + load in a
 * worker + validate) once per source text; a new file is checked before it is added; the panel
 * lists every upload in the section "Yours", a loading or failed one disabled with its reason.
 */

export const prepareTransformCached = cachedPreparer<TransformUploadStatus>(prepareTransformUpload, (problems) => ({ ok: false, problems }));

/** A stored transform with its preparation status. */
export type LoadedTransform = PreparedUpload<TransformUploadStatus>;

/** Prepare every stored transform (asynchronously, in workers). */
export const useUploadedTransforms = (stored: readonly StoredUpload[]): readonly LoadedTransform[] => usePreparedUploads(stored, prepareTransformCached);

const TRANSFORM_SURFACE: UploadSurface<TransformUploadStatus> = { kind: 'transform', max: MAX_UPLOADED_TRANSFORMS, prepare: prepareTransformCached };

export type TransformUploadCheck = StoredUploadCheck<UploadedTransformDefinition>;

/**
 * Check a chosen transform file and return the new list of uploads (appended, or in place of
 * `replaceId`). Refused with readable problems, e.g. an analysis ("upload it in Analyse"), a
 * syntax error, an invalid definition or the same id as another uploaded transform.
 */
export const addTransformUpload = (
  file: { readonly name: string; readonly size: number; text(): Promise<string> },
  current: readonly LoadedTransform[],
  replaceId: string | null,
  options: { readonly now?: Date; readonly runner?: UploadRunner } = {},
): Promise<TransformUploadCheck> => addStoredUpload(TRANSFORM_SURFACE, file, current, replaceId, options);

/** Panel key of an uploaded transform (a toolkit transform's key is `toolkit:<file>`). */
export const yoursTransformKey = (uploadId: string) => `yours:${uploadId}`;

/** One uploaded transform as the panel lists it: an `AlgorithmEntry` (parameters form, problems) plus its upload. */
export interface UploadedTransformEntry extends AlgorithmEntry {
  readonly key: string;
  readonly uploadId: string;
  readonly fileName: string;
  /** Still being prepared in its worker. */
  readonly loading: boolean;
}

/**
 * The panel's view of the uploaded transforms, in upload order: a ready one with its label and
 * parameters; a loading one ("Loading…") or a failed one (its problems) disabled, under its file name.
 */
export function transformUploadEntries(loaded: readonly LoadedTransform[]): UploadedTransformEntry[] {
  return loaded.map(({ stored, status }) => {
    const base = { key: yoursTransformKey(stored.id), uploadId: stored.id, fileName: stored.fileName, scope: 'spatial', file: stored.fileName, inputs: [] } as const;
    if (status === 'loading') return { ...base, id: stored.id, label: stored.fileName, enabled: false, problems: ['Loading…'], parameters: [], loading: true };
    if (!status.ok) return { ...base, id: stored.id, label: stored.fileName, enabled: false, problems: status.problems, parameters: [], loading: false };
    const { definition } = status;
    return { ...base, id: definition.id, label: definition.label, enabled: true, problems: [], parameters: Object.entries(definition.parameters), loading: false };
  });
}
