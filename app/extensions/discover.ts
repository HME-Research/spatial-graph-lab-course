import { z } from 'zod';
import { diagnostic, type ExtensionDiagnostic } from './diagnostics';

/**
 * A toolkit id is its folder name: lowercase letters, digits, "-" and "_", starting with a letter
 * (e.g. `example-gallery`, `level_1_house_growth`). Wider than node type / algorithm ids, which
 * do not allow "_"; every node type id and saved project id is also a valid toolkit id.
 */
export const TOOLKIT_ID_PATTERN = /^[a-z][a-z0-9_-]*$/;
export const toolkitIdSchema = z.string().regex(TOOLKIT_ID_PATTERN, {
  error: 'must be lowercase letters, digits, "-" or "_", starting with a letter',
});

/**
 * Pure toolkit discovery. Input is the raw record produced by Vite's `import.meta.glob`
 * (path → lazy loader; see toolkitGlobs.ts), so discovery and selection are testable without Vite.
 * Loaders are not called here: only the active toolkit's modules are ever loaded.
 */

export type ModuleLoader = () => Promise<unknown>;
export type TextLoader = () => Promise<string>;

export interface ToolkitGlobs {
  readonly toolkit: Readonly<Record<string, ModuleLoader>>;
  readonly types: Readonly<Record<string, ModuleLoader>>;
  readonly algorithms: Readonly<Record<string, ModuleLoader>>;
  readonly designs: Readonly<Record<string, TextLoader>>;
}

export interface SourceFile<L> {
  /** Repository-relative path, e.g. "toolkits/example-gallery/types/gallery.ts". */
  readonly file: string;
  /** File name without extension: the design id for designs. */
  readonly stem: string;
  readonly load: L;
}

export interface ToolkitSource {
  /** The folder name. */
  readonly id: string;
  readonly toolkit: SourceFile<ModuleLoader>;
  readonly types: readonly SourceFile<ModuleLoader>[];
  readonly algorithms: readonly SourceFile<ModuleLoader>[];
  readonly designs: readonly SourceFile<TextLoader>[];
}

/** Used when neither the URL nor the environment selects a toolkit. */
export const DEFAULT_TOOLKIT_ID = 'example-gallery';

const PATH = /^\/?toolkits\/([^/]+)\/(?:(toolkit)\.ts|(types|algorithms)\/([^/]+)\.ts|(designs)\/([^/]+)\.json)$/;

type Section = 'toolkit' | 'types' | 'algorithms' | 'designs';

interface Parsed {
  readonly toolkitId: string;
  readonly section: Section;
  readonly file: string;
  readonly stem: string;
}

function parsePath(path: string): Parsed | null {
  if (path.endsWith('.test.ts')) return null;
  const m = PATH.exec(path);
  if (!m) return null;
  const file = path.replace(/^\//, '');
  if (m[2]) return { toolkitId: m[1]!, section: 'toolkit', file, stem: 'toolkit' };
  if (m[3]) return { toolkitId: m[1]!, section: m[3] as Section, file, stem: m[4]! };
  return { toolkitId: m[1]!, section: 'designs', file, stem: m[6]! };
}

const byFile = <T extends { file: string }>(a: T, b: T) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0);

export function discoverToolkits(globs: ToolkitGlobs): {
  readonly toolkits: readonly ToolkitSource[];
  readonly diagnostics: readonly ExtensionDiagnostic[];
} {
  interface Draft {
    toolkit?: SourceFile<ModuleLoader>;
    types: SourceFile<ModuleLoader>[];
    algorithms: SourceFile<ModuleLoader>[];
    designs: SourceFile<TextLoader>[];
  }
  const drafts = new Map<string, Draft>();
  const draftFor = (id: string): Draft => {
    let d = drafts.get(id);
    if (!d) drafts.set(id, (d = { types: [], algorithms: [], designs: [] }));
    return d;
  };

  const sections: [Section, Readonly<Record<string, ModuleLoader | TextLoader>>][] = [
    ['toolkit', globs.toolkit],
    ['types', globs.types],
    ['algorithms', globs.algorithms],
    ['designs', globs.designs],
  ];
  for (const [section, record] of sections) {
    for (const [path, load] of Object.entries(record)) {
      const parsed = parsePath(path);
      if (!parsed || parsed.section !== section) continue;
      const draft = draftFor(parsed.toolkitId);
      const source = { file: parsed.file, stem: parsed.stem, load };
      if (section === 'toolkit') draft.toolkit = source as SourceFile<ModuleLoader>;
      else if (section === 'designs') draft.designs.push(source as SourceFile<TextLoader>);
      else draft[section].push(source as SourceFile<ModuleLoader>);
    }
  }

  const diagnostics: ExtensionDiagnostic[] = [];
  const toolkits: ToolkitSource[] = [];
  for (const id of [...drafts.keys()].sort()) {
    const d = drafts.get(id)!;
    const folder = `toolkits/${id}`;
    if (!toolkitIdSchema.safeParse(id).success) {
      diagnostics.push(
        diagnostic('invalid-toolkit-folder', 'error', { kind: 'file', path: folder }, `toolkit folder "${id}" must be lowercase letters, digits, "-" or "_", starting with a letter; it was ignored`),
      );
      continue;
    }
    if (!d.toolkit) {
      diagnostics.push(
        diagnostic('missing-toolkit-file', 'error', { kind: 'file', path: folder }, `"${folder}" has no toolkit.ts; it was ignored`),
      );
      continue;
    }
    toolkits.push({
      id,
      toolkit: d.toolkit,
      types: d.types.sort(byFile),
      algorithms: d.algorithms.sort(byFile),
      designs: d.designs.sort(byFile),
    });
  }
  return { toolkits, diagnostics };
}

export interface ToolkitRequest {
  /** `?toolkit=` from the URL. */
  readonly query?: string | null | undefined;
  /** `VITE_SGL_TOOLKIT`. */
  readonly env?: string | null | undefined;
}

/**
 * Which toolkit to activate: the URL query, else the environment, else `example-gallery` if it
 * exists, else none. An explicitly requested toolkit that does not exist is an error; it never
 * silently falls back to another toolkit.
 */
export function selectToolkit(
  available: readonly string[],
  request: ToolkitRequest,
): { readonly id: string | null; readonly diagnostic?: ExtensionDiagnostic } {
  const requested = [request.query, request.env].map((v) => v?.trim()).find((v) => v !== undefined && v !== '');
  if (requested !== undefined) {
    if (available.includes(requested)) return { id: requested };
    return {
      id: null,
      diagnostic: diagnostic(
        'unknown-toolkit',
        'error',
        { kind: 'toolkit', id: requested },
        `toolkit "${requested}" was requested but does not exist${available.length ? ` (available: ${available.join(', ')})` : ''}`,
      ),
    };
  }
  return { id: available.includes(DEFAULT_TOOLKIT_ID) ? DEFAULT_TOOLKIT_ID : null };
}
