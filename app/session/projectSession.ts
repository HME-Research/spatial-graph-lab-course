import type { DesignDocument } from '@app/document';
import {
  activate,
  discoverProjects,
  resolveStartupDesign,
  type Activation,
  type ActiveProject,
  type ExtensionDiagnostic,
  type ProjectGlobs,
  type ProjectRequest,
  type StartupDesign,
} from '@app/extensions';

/**
 * Pure project-session logic for the application shell: which project to activate, what to show
 * at startup and how to describe the outcome. Uses the Stage 3A runtime (`activate`,
 * `resolveStartupDesign`) unchanged; it does not load projects any other way. Activation never
 * runs an algorithm.
 */

export interface ProjectSession {
  readonly activation: Activation;
  /** Problems with project folders themselves (e.g. a folder without project.ts). */
  readonly discovery: readonly ExtensionDiagnostic[];
  /** Ids of every discovered, well-formed project (for the project menu). */
  readonly available: readonly string[];
}

export interface ProjectStart {
  readonly session: ProjectSession;
  readonly startup: StartupDesign;
}

/** `?project=` from a URL search string, and `VITE_SGL_PROJECT` from the environment. */
export function readProjectRequest(search: string, env: string | undefined): ProjectRequest {
  return { query: new URLSearchParams(search).get('project'), env: env ?? null };
}

/** URL search string that selects `projectId`, keeping any other parameters. */
export function searchWithProject(search: string, projectId: string): string {
  const params = new URLSearchParams(search);
  params.set('project', projectId);
  return `?${params.toString()}`;
}

/** Activate the requested project and resolve the design to show. Never throws, never runs algorithms. */
export async function startProject(
  globs: ProjectGlobs,
  request: ProjectRequest,
  builtIn: { readonly doc: DesignDocument; readonly source: string },
): Promise<ProjectStart> {
  const { activation, discovery } = await activate(globs, request);
  const available = discoverProjects(globs).projects.map((p) => p.id);
  return { session: { activation, discovery, available }, startup: resolveStartupDesign(activation, builtIn) };
}

export const activeProjectOf = (session: ProjectSession | null): ActiveProject | null =>
  session?.activation.status === 'active' ? session.activation.project : null;

export type HeadlineTone = 'ok' | 'warning' | 'error';

export interface ProjectHeadline {
  readonly tone: HeadlineTone;
  readonly title: string;
  /** Additional explanation shown under the title, if any. */
  readonly detail?: string;
}

const count = (n: number, what: string) => `${n} ${what}${n === 1 ? '' : 's'}`;

/** One-line description of the session for the project bar. */
export function projectHeadline(session: ProjectSession, docLoaded: boolean): ProjectHeadline {
  const { activation } = session;
  if (activation.status === 'none') {
    return { tone: 'ok', title: 'No project', detail: 'No project is selected; the built-in example is shown.' };
  }
  if (activation.status === 'failed') {
    return {
      tone: 'error',
      title: `Project “${activation.projectId}” could not be activated`,
      detail: 'Its types and algorithms are not available. The built-in example is shown instead; fix the problems below and reload.',
    };
  }
  const { project } = activation;
  const errors = project.diagnostics.filter((d) => d.severity === 'error').length;
  const title = `${project.definition.name}`;
  if (!docLoaded) {
    return { tone: 'error', title, detail: 'The project’s default design could not be loaded, so no design is open. See the problems below.' };
  }
  return errors > 0
    ? { tone: 'error', title, detail: `${count(errors, 'problem')} in the project’s files: the affected definitions are disabled.` }
    : { tone: 'ok', title };
}

/** Every activation/discovery diagnostic to show persistently, errors first. */
export function sessionDiagnostics(session: ProjectSession): ExtensionDiagnostic[] {
  const { activation } = session;
  const own =
    activation.status === 'active' ? activation.project.diagnostics : activation.status === 'failed' ? activation.diagnostics : [];
  const rank = { error: 0, warning: 1, info: 2 } as const;
  return [...session.discovery, ...own].sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export const DISCARD_PROMPT =
  'The current design has changes that have not been exported. Switching will discard them.\n\nUse “Export JSON” first to keep them. Discard the changes?';
