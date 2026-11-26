import {
  designAssetIds,
  loadToolkitAssets,
  loadUploadedToolkit,
  storedFileBytes,
  toolkitFromZip,
  uploadedAssetBytes,
  uploadedToolkitAssets,
  type StoredToolkit,
  type ToolkitAssetIo,
  type UploadedToolkitLoad,
} from '@app/extensions';
import { deflatedZip } from '@app/ui/guide/zip';
import type { UploadedAssetLoader, UploadedToolkitStart } from './welcomeFlow';

/**
 * Toolkit upload and download in the shell (owner 2026-11-26): read a chosen `.zip` into a loaded
 * toolkit (`toolkitFromZip` → `loadUploadedToolkit`), import the façades a design uses from the
 * toolkit's own files, and write the toolkit back as `<name>.zip` with `<name>/toolkit.ts` directly
 * inside (the hand-in shape). Labels shared by Welcome, the Project panel and the Guide live here.
 */

export const UPLOAD_TOOLKIT_LABEL = 'Upload toolkit (.zip)';
export const DOWNLOAD_TOOLKIT_LABEL = 'Download toolkit (.zip)';
export const ADD_TOOLKIT_LABEL = 'Add a toolkit…';

export type ToolkitZipRead =
  | { readonly ok: true; readonly start: UploadedToolkitStart; readonly ignored: readonly string[]; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly problems: readonly string[] };

/** Read and load an uploaded toolkit zip. Never throws; nothing is changed. */
export async function readToolkitZip(
  bytes: Uint8Array,
  fileName: string,
  load: (stored: StoredToolkit) => Promise<UploadedToolkitLoad> = (stored) => loadUploadedToolkit(stored),
): Promise<ToolkitZipRead> {
  const zip = await toolkitFromZip(bytes, fileName);
  if (!zip.ok) return zip;
  const loaded = await load(zip.toolkit);
  if (!loaded.ok) return loaded;
  return { ok: true, start: { stored: zip.toolkit, toolkit: loaded.toolkit }, ignored: zip.ignored, warnings: loaded.warnings };
}

/** The bytes of `<name>.zip` (compressed): the folder `<name>/` with every stored file exactly as uploaded (line endings kept). */
export function toolkitZipBytes(stored: StoredToolkit): Promise<Uint8Array> {
  return deflatedZip(stored.files.map((f) => ({ name: `${stored.name}/${f.path}`, bytes: storedFileBytes(f) })));
}

/** Start a browser download of the toolkit as `<name>.zip`. Throws when the browser refuses. */
export async function downloadToolkitZip(stored: StoredToolkit): Promise<void> {
  const url = URL.createObjectURL(new Blob([(await toolkitZipBytes(stored)) as Uint8Array<ArrayBuffer>], { type: 'application/zip' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${stored.name}.zip`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** The façades a design of an uploaded toolkit uses, through the normal façade import (`importFile`). */
export const uploadedAssetLoader =
  (stored: StoredToolkit, importFile: ToolkitAssetIo['importFile']): UploadedAssetLoader =>
  (doc) =>
    loadToolkitAssets(stored.name, uploadedToolkitAssets(stored), designAssetIds(doc), { fetchBytes: (path) => uploadedAssetBytes(stored, path), importFile });
