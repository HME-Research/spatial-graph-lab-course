import { facadeAssetIdsOf, FACADE_LIMITS, formatBytes, type FacadeAssetV1 } from '@app/assets';
import type { ImportFacadeResult } from '@app/assets/importFacade';
import { readDesignJson, type DesignDocumentV2 } from '@app/document';
import { toolkitDefinitionSchema } from './definitions';
import { discoverToolkits, type SourceFile, type ToolkitGlobs, type UrlLoader } from './discover';

/**
 * Toolkit examples and toolkit façade assets (owner decision 2026-11-20, "Open example and
 * toolkit façade assets"). Pure apart from the injected loaders: nothing here fetches a file or
 * loads rhino3dm itself.
 *
 * - Every design in `toolkits/<id>/designs/` is an example that Open example… lists, with the
 *   design's `metadata.name` / `description` and its toolkit's name.
 * - A toolkit may ship façade files in `toolkits/<id>/assets/` (`.3dm`). A design refers to one
 *   by the asset id the app's own import gives it (`facade-<16 hex>`, content-addressed: the
 *   first 16 hex digits of the SHA-256 of the normalised mesh). Opening the example runs each
 *   file through the normal façade import pipeline and keeps the assets the design refers to;
 *   `npm run check:toolkit` checks that every referenced id is produced by a file.
 */

/** One toolkit design offered by Open example…. */
export interface ToolkitExample {
  readonly toolkitId: string;
  /** The toolkit's `name` (its id when `toolkit.ts` cannot be read). */
  readonly toolkitName: string;
  /** The design id: its file name without `.json`. */
  readonly designId: string;
  /** Repository-relative path, e.g. `toolkits/house/designs/garden-house.json`. */
  readonly file: string;
  /** `metadata.name` (the file name when the design is invalid). */
  readonly name: string;
  readonly description: string | null;
  /** Why the design cannot be opened (invalid JSON or design), else null. */
  readonly problem: string | null;
}

/** The toolkit's name and default design (its id and none when `toolkit.ts` cannot be read). */
async function toolkitInfo(load: () => Promise<unknown>, fallback: string): Promise<{ readonly name: string; readonly defaultDesign: string | null }> {
  try {
    const mod = await load();
    const definition = typeof mod === 'object' && mod !== null && 'default' in mod ? (mod as { default: unknown }).default : undefined;
    const parsed = toolkitDefinitionSchema.safeParse(definition);
    return parsed.success ? { name: parsed.data.name, defaultDesign: parsed.data.defaultDesign ?? null } : { name: fallback, defaultDesign: null };
  } catch {
    return { name: fallback, defaultDesign: null };
  }
}

/**
 * Every design of every toolkit, toolkits by id; within a toolkit its `defaultDesign` first, then
 * the others by file (owner 2026-11-20). Loads each `toolkit.ts` (for its name and default design)
 * and each design's text; never activates a toolkit. A design that cannot be read is
 * listed with its `problem`, so it is not silently missing.
 */
export async function listToolkitExamples(globs: ToolkitGlobs): Promise<readonly ToolkitExample[]> {
  const out: ToolkitExample[] = [];
  for (const source of discoverToolkits(globs).toolkits) {
    if (source.designs.length === 0) continue;
    const { name, defaultDesign } = await toolkitInfo(source.toolkit.load, source.id);
    const designs = [...source.designs].sort((a, b) => Number(b.stem === defaultDesign) - Number(a.stem === defaultDesign));
    for (const design of designs) {
      const base = { toolkitId: source.id, toolkitName: name, designId: design.stem, file: design.file };
      try {
        const read = readDesignJson(await design.load());
        if (read.ok) {
          const meta = read.value.doc.metadata;
          out.push({ ...base, name: meta.name.trim() || design.stem, description: meta.description?.trim() || null, problem: null });
        } else {
          out.push({ ...base, name: design.stem, description: null, problem: `${design.file} is not a valid design (${read.issues.length} problem${read.issues.length === 1 ? '' : 's'})` });
        }
      } catch (error) {
        out.push({ ...base, name: design.stem, description: null, problem: `${design.file} could not be read: ${error instanceof Error ? error.message : String(error)}` });
      }
    }
  }
  return out;
}

/** Façade asset ids a design refers to (any card of any remembered setup), sorted. */
export const designAssetIds = (doc: Pick<DesignDocumentV2, 'settings'>): readonly string[] => facadeAssetIdsOf(doc);

/** How the host reads and imports one toolkit asset file (the browser: fetch + the lazy 3DM import). */
export interface ToolkitAssetIo {
  /** The bytes of the file served at `url` (the `?url` of the asset). */
  readonly fetchBytes: (url: string) => Promise<Uint8Array>;
  /** The normal façade import (`importFacadeFile` of `@app/assets/rhino/browser`, Outside −Y). */
  readonly importFile: (bytes: Uint8Array, fileName: string) => Promise<ImportFacadeResult>;
}

export type ToolkitAssetsResult =
  | { readonly ok: true; readonly assets: readonly FacadeAssetV1[] }
  | { readonly ok: false; readonly message: string };

const fileNameOf = (file: SourceFile<UrlLoader>): string => file.stem;

/**
 * The project assets an example needs: each file of the toolkit's `assets/` is imported through
 * the normal façade pipeline (in file order, stopping once every id is found) and the assets the
 * design refers to (`needed`) are kept. Fails, naming the ids, when a file cannot be read or
 * imported, or when an id is produced by no file; never returns a partial set. No ids: nothing is
 * fetched.
 */
export async function loadToolkitAssets(
  toolkitId: string,
  files: readonly SourceFile<UrlLoader>[],
  needed: readonly string[],
  io: ToolkitAssetIo,
): Promise<ToolkitAssetsResult> {
  const wanted = new Set(needed);
  if (wanted.size === 0) return { ok: true, assets: [] };
  const found = new Map<string, FacadeAssetV1>();
  const produced: string[] = [];
  for (const file of files) {
    if (found.size === wanted.size) break;
    const fileName = fileNameOf(file);
    let bytes: Uint8Array;
    try {
      bytes = await io.fetchBytes(await file.load());
    } catch (error) {
      return { ok: false, message: `${file.file} could not be read: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (bytes.byteLength > FACADE_LIMITS.maxFileBytes) {
      return { ok: false, message: `${file.file} is ${formatBytes(bytes.byteLength)}; the façade import limit is ${formatBytes(FACADE_LIMITS.maxFileBytes)}` };
    }
    const result = await io.importFile(bytes, fileName);
    if (result.status === 'needs-unit') return { ok: false, message: `${file.file} has no unit; save it in Rhino with a unit (metres, centimetres or millimetres)` };
    if (result.status === 'refused') {
      const why = result.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message);
      return { ok: false, message: `${file.file} could not be imported: ${why.join('; ') || 'refused'}` };
    }
    produced.push(`${fileName} → ${result.asset.id}`);
    if (wanted.has(result.asset.id)) found.set(result.asset.id, result.asset);
  }
  const missing = [...wanted].filter((id) => !found.has(id)).sort();
  if (missing.length > 0) {
    const from = files.length === 0 ? `toolkits/${toolkitId}/assets/ has no .3dm files` : `its files give ${produced.join(', ')}`;
    return { ok: false, message: `the design uses façade ${missing.join(', ')}, which no file in toolkits/${toolkitId}/assets/ provides (${from})` };
  }
  return { ok: true, assets: [...wanted].sort().map((id) => found.get(id)!) };
}
