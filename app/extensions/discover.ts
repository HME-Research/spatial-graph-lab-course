import { typeIdSchema } from '@app/document';
import { diagnostic, type ExtensionDiagnostic } from './diagnostics';

/**
 * Pure project discovery. Input is the raw record produced by Vite's `import.meta.glob`
 * (path → lazy loader; see projectGlobs.ts), so discovery and selection are testable without Vite.
 * Loaders are not called here: only the active project's modules are ever loaded.
 */

export type ModuleLoader = () => Promise<unknown>;
export type TextLoader = () => Promise<string>;

export interface ProjectGlobs {
  readonly project: Readonly<Record<string, ModuleLoader>>;
  readonly types: Readonly<Record<string, ModuleLoader>>;
  readonly algorithms: Readonly<Record<string, ModuleLoader>>;
  readonly designs: Readonly<Record<string, TextLoader>>;
}

export interface SourceFile<L> {
  /** Repository-relative path, e.g. "projects/example-gallery/types/gallery.ts". */
  readonly file: string;
  /** File name without extension: the design id for designs. */
  readonly stem: string;
  readonly load: L;
}

export interface ProjectSource {
  /** The folder name. */
  readonly id: string;
  readonly project: SourceFile<ModuleLoader>;
  readonly types: readonly SourceFile<ModuleLoader>[];
  readonly algorithms: readonly SourceFile<ModuleLoader>[];
  readonly designs: readonly SourceFile<TextLoader>[];
}

/** Used when neither the URL nor the environment selects a project. */
export const DEFAULT_PROJECT_ID = 'example-gallery';

const PATH = /^\/?projects\/([^/]+)\/(?:(project)\.ts|(types|algorithms)\/([^/]+)\.ts|(designs)\/([^/]+)\.json)$/;

type Section = 'project' | 'types' | 'algorithms' | 'designs';

interface Parsed {
  readonly projectId: string;
  readonly section: Section;
  readonly file: string;
  readonly stem: string;
}

function parsePath(path: string): Parsed | null {
  if (path.endsWith('.test.ts')) return null;
  const m = PATH.exec(path);
  if (!m) return null;
  const file = path.replace(/^\//, '');
  if (m[2]) return { projectId: m[1]!, section: 'project', file, stem: 'project' };
  if (m[3]) return { projectId: m[1]!, section: m[3] as Section, file, stem: m[4]! };
  return { projectId: m[1]!, section: 'designs', file, stem: m[6]! };
}

const byFile = <T extends { file: string }>(a: T, b: T) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0);

export function discoverProjects(globs: ProjectGlobs): {
  readonly projects: readonly ProjectSource[];
  readonly diagnostics: readonly ExtensionDiagnostic[];
} {
  interface Draft {
    project?: SourceFile<ModuleLoader>;
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
    ['project', globs.project],
    ['types', globs.types],
    ['algorithms', globs.algorithms],
    ['designs', globs.designs],
  ];
  for (const [section, record] of sections) {
    for (const [path, load] of Object.entries(record)) {
      const parsed = parsePath(path);
      if (!parsed || parsed.section !== section) continue;
      const draft = draftFor(parsed.projectId);
      const source = { file: parsed.file, stem: parsed.stem, load };
      if (section === 'project') draft.project = source as SourceFile<ModuleLoader>;
      else if (section === 'designs') draft.designs.push(source as SourceFile<TextLoader>);
      else draft[section].push(source as SourceFile<ModuleLoader>);
    }
  }

  const diagnostics: ExtensionDiagnostic[] = [];
  const projects: ProjectSource[] = [];
  for (const id of [...drafts.keys()].sort()) {
    const d = drafts.get(id)!;
    const folder = `projects/${id}`;
    if (!typeIdSchema.safeParse(id).success) {
      diagnostics.push(
        diagnostic('invalid-project-folder', 'error', { kind: 'file', path: folder }, `project folder "${id}" must be lowercase letters, digits and "-", starting with a letter; it was ignored`),
      );
      continue;
    }
    if (!d.project) {
      diagnostics.push(
        diagnostic('missing-project-file', 'error', { kind: 'file', path: folder }, `"${folder}" has no project.ts; it was ignored`),
      );
      continue;
    }
    projects.push({
      id,
      project: d.project,
      types: d.types.sort(byFile),
      algorithms: d.algorithms.sort(byFile),
      designs: d.designs.sort(byFile),
    });
  }
  return { projects, diagnostics };
}

export interface ProjectRequest {
  /** `?project=` from the URL. */
  readonly query?: string | null | undefined;
  /** `VITE_SGL_PROJECT`. */
  readonly env?: string | null | undefined;
}

/**
 * Which project to activate: the URL query, else the environment, else `example-gallery` if it
 * exists, else none. An explicitly requested project that does not exist is an error; it never
 * silently falls back to another project.
 */
export function selectProject(
  available: readonly string[],
  request: ProjectRequest,
): { readonly id: string | null; readonly diagnostic?: ExtensionDiagnostic } {
  const requested = [request.query, request.env].map((v) => v?.trim()).find((v) => v !== undefined && v !== '');
  if (requested !== undefined) {
    if (available.includes(requested)) return { id: requested };
    return {
      id: null,
      diagnostic: diagnostic(
        'unknown-project',
        'error',
        { kind: 'project', id: requested },
        `project "${requested}" was requested but does not exist${available.length ? ` (available: ${available.join(', ')})` : ''}`,
      ),
    };
  }
  return { id: available.includes(DEFAULT_PROJECT_ID) ? DEFAULT_PROJECT_ID : null };
}
