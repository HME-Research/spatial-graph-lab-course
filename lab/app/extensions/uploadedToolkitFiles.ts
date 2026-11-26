import { TOOLKIT_ID_PATTERN } from './discover';
import { readZip, type ZipFileEntry } from './zipReader';

/**
 * Uploaded toolkits, step 1 (owner 2026-11-26): from a `.zip` to the FILES of one toolkit folder,
 * the form the project file stores (`settings.uploadedToolkit`). Nothing here runs student code.
 *
 * - The toolkit folder may be at the zip root, inside one folder (`<name>/toolkit.ts`, what the
 *   hand-in asks for) or inside one more wrapping folder (`download/<name>/toolkit.ts`).
 *   `__MACOSX/`, `.DS_Store`, `Thumbs.db` and `desktop.ini` are ignored.
 * - Kept: `.ts` (not tests), `.json` and `.md` as text, `assets/*.3dm` as bytes (base64 in the
 *   project). Anything else is left out and listed.
 * - Limits: the zip ≤ 5 MB, at most 200 files, a text file ≤ 500 KB, text ≤ 2 MB together, façade
 *   files ≤ 20 MB together (the façade import limit per file).
 */

/** One file of an uploaded toolkit: its path inside the toolkit folder, and its text or (assets) bytes in base64. */
export type StoredToolkitFile = { readonly path: string; readonly text: string } | { readonly path: string; readonly base64: string };

/** An uploaded toolkit as the project file stores it (`settings.uploadedToolkit`). */
export interface StoredToolkit {
  /** The toolkit name: the folder name (the project's `toolkit.id`). */
  readonly name: string;
  /** ISO time of the upload. */
  readonly uploadedAt: string;
  /** Sorted by path; unique paths. */
  readonly files: readonly StoredToolkitFile[];
}

export const MAX_TOOLKIT_ZIP_BYTES = 5 * 1024 * 1024;
export const MAX_TOOLKIT_FILES = 200;
export const MAX_TOOLKIT_TEXT_FILE_BYTES = 500_000;
export const MAX_TOOLKIT_TEXT_BYTES = 2_000_000;
export const MAX_TOOLKIT_ASSET_BYTES = 20 * 1024 * 1024;
/** A path inside the toolkit folder: up to 4 parts of letters, digits, ".", "-", "_" or spaces. */
export const TOOLKIT_FILE_PATH_PATTERN = /^(?:[A-Za-z0-9_][A-Za-z0-9 ._-]{0,99}\/){0,3}[A-Za-z0-9_][A-Za-z0-9 ._-]{0,99}$/;

const JUNK = /(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$|desktop\.ini$|\._)/i;

/** What a file of the toolkit folder is: text, a façade asset, or left out. */
export function toolkitFileKind(path: string): 'text' | 'asset' | null {
  const lower = path.toLowerCase();
  if (lower.endsWith('.test.ts') || lower.endsWith('.d.ts')) return null;
  if (/^assets\/[^/]+\.3dm$/i.test(path)) return 'asset';
  if (lower.endsWith('.ts') || lower.endsWith('.json') || lower.endsWith('.md')) return 'text';
  return null;
}

export const toBase64 = (bytes: Uint8Array): string => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
};
export const fromBase64 = (text: string): Uint8Array => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** The bytes of a stored file (text as UTF-8). */
export const storedFileBytes = (file: StoredToolkitFile): Uint8Array => ('text' in file ? new TextEncoder().encode(file.text) : fromBase64(file.base64));

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export type ToolkitFromZip =
  | {
      readonly ok: true;
      readonly toolkit: StoredToolkit;
      /** Files of the zip that were left out (outside the folder, or of a kind the app does not use). */
      readonly ignored: readonly string[];
    }
  | { readonly ok: false; readonly problems: readonly string[] };

/** The folder of a zip that holds `toolkit.ts`, or a plain refusal. */
export function findToolkitFolder(paths: readonly string[], zipName: string): { readonly ok: true; readonly root: string; readonly name: string } | { readonly ok: false; readonly problem: string } {
  const candidates = paths.filter((p) => p === 'toolkit.ts' || p.endsWith('/toolkit.ts')).sort((a, b) => a.split('/').length - b.split('/').length);
  if (candidates.length === 0) {
    const nearMiss = paths.find((p) => /(^|\/)toolkit\.(ts\.txt|txt|js|tsx)$/i.test(p) || /(^|\/)Toolkit\.ts$/.test(p));
    return {
      ok: false,
      problem: `toolkit.ts was not found in the zip.${nearMiss ? ` There is "${nearMiss}": it must be called exactly toolkit.ts.` : ''} toolkit.ts must be directly inside the folder <your-toolkit-name>/, and the zip must contain that folder (e.g. u123-hk-house/toolkit.ts).`,
    };
  }
  const first = candidates[0]!;
  const depth = first.split('/').length - 1;
  if (candidates.filter((c) => c.split('/').length - 1 === depth).length > 1) {
    return { ok: false, problem: `The zip holds more than one toolkit (${candidates.join(', ')}). Upload one toolkit folder per zip.` };
  }
  if (depth > 2) {
    return { ok: false, problem: `toolkit.ts is ${depth} folders deep (${first}). toolkit.ts must be directly inside the folder <your-toolkit-name>/: zip that folder itself.` };
  }
  const root = depth === 0 ? '' : first.slice(0, -'toolkit.ts'.length);
  const name = depth === 0 ? zipName.replace(/\.zip$/i, '').replace(/\s*\(\d+\)$/, '').trim() : root.slice(0, -1).split('/').pop()!;
  if (!TOOLKIT_ID_PATTERN.test(name)) {
    const where = depth === 0 ? `toolkit.ts is not inside a folder, so the toolkit name is taken from the zip's name, "${name}"` : `The folder holding toolkit.ts is called "${name}"`;
    return { ok: false, problem: `${where}, which is not a valid toolkit name. A toolkit name is lowercase letters, digits and "-", starting with a letter, e.g. u123-hk-house. toolkit.ts must be directly inside the folder <your-toolkit-name>/.` };
  }
  return { ok: true, root, name };
}

/** The toolkit files of a zip's entries (see the module comment). */
export function toolkitFromEntries(entries: readonly ZipFileEntry[], zipName: string, now: () => string = () => new Date().toISOString()): ToolkitFromZip {
  const usable = entries.filter((e) => !JUNK.test(e.path));
  const found = findToolkitFolder(
    usable.map((e) => e.path),
    zipName,
  );
  if (!found.ok) return { ok: false, problems: [found.problem] };
  const ignored: string[] = [];
  const problems: string[] = [];
  const files: StoredToolkitFile[] = [];
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = 0;
  let assets = 0;
  for (const entry of usable) {
    if (!entry.path.startsWith(found.root)) {
      ignored.push(entry.path);
      continue;
    }
    const path = entry.path.slice(found.root.length);
    const kind = toolkitFileKind(path);
    if (kind === null || !TOOLKIT_FILE_PATH_PATTERN.test(path)) {
      ignored.push(entry.path);
      continue;
    }
    const shown = `${found.name}/${path}`;
    if (kind === 'asset') {
      assets += entry.bytes.length;
      files.push({ path, base64: toBase64(entry.bytes) });
      continue;
    }
    if (entry.bytes.length > MAX_TOOLKIT_TEXT_FILE_BYTES) {
      problems.push(`${shown} is ${Math.ceil(entry.bytes.length / 1000)} KB; a text file may be at most ${MAX_TOOLKIT_TEXT_FILE_BYTES / 1000} KB.`);
      continue;
    }
    text += entry.bytes.length;
    try {
      files.push({ path, text: decoder.decode(entry.bytes).replace(/^﻿/, '') });
    } catch {
      problems.push(`${shown} is not UTF-8 text. Save it as UTF-8.`);
    }
  }
  if (text > MAX_TOOLKIT_TEXT_BYTES) problems.push(`The toolkit's text files are ${Math.ceil(text / 1000)} KB together; at most ${MAX_TOOLKIT_TEXT_BYTES / 1000} KB are allowed.`);
  if (assets > MAX_TOOLKIT_ASSET_BYTES) problems.push(`The façade files in assets/ are more than ${MAX_TOOLKIT_ASSET_BYTES / (1024 * 1024)} MB together.`);
  if (files.length > MAX_TOOLKIT_FILES) problems.push(`The toolkit has ${plural(files.length, 'file')}; at most ${MAX_TOOLKIT_FILES} are allowed.`);
  if (problems.length > 0) return { ok: false, problems };
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { ok: true, toolkit: { name: found.name, uploadedAt: now(), files }, ignored };
}

/** Read an uploaded `.zip` into the files of one toolkit. Never throws. */
export async function toolkitFromZip(bytes: Uint8Array, zipName: string, now?: () => string): Promise<ToolkitFromZip> {
  if (!zipName.toLowerCase().endsWith('.zip')) return { ok: false, problems: [`"${zipName}" is not a .zip file. Upload the toolkit as a .zip file.`] };
  if (bytes.length > MAX_TOOLKIT_ZIP_BYTES) {
    return { ok: false, problems: [`"${zipName}" is ${Math.round((bytes.length / (1024 * 1024)) * 10) / 10} MB; a toolkit zip may be at most ${MAX_TOOLKIT_ZIP_BYTES / (1024 * 1024)} MB.`] };
  }
  const read = await readZip(bytes, {
    maxEntries: 4 * MAX_TOOLKIT_FILES,
    maxFileBytes: MAX_TOOLKIT_ASSET_BYTES,
    maxTotalBytes: MAX_TOOLKIT_ASSET_BYTES + MAX_TOOLKIT_TEXT_BYTES * 2,
    wanted: (path) => !JUNK.test(path),
  });
  if (!read.ok) return { ok: false, problems: [read.message] };
  return toolkitFromEntries(read.files, zipName, now);
}
