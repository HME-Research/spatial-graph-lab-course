import type { DesignDocumentV2 } from '@app/document';
import {
  activate,
  diagnostic,
  loadUploadedToolkit,
  discoverToolkits,
  resolveStartupDesign,
  type Activation,
  type ActiveToolkit,
  type ExtensionDiagnostic,
  type ToolkitGlobs,
  type ToolkitRequest,
  type StartupDesign,
  type StoredToolkit,
  type UploadedToolkitLoad,
} from '@app/extensions';

/**
 * Pure toolkit-session logic for the application shell: which toolkit to activate, what to show
 * at startup and how to describe the outcome. Uses the Stage 3A runtime (`activate`,
 * `resolveStartupDesign`) unchanged; it does not load toolkits any other way. Activation never
 * runs an algorithm.
 */

export interface ToolkitSession {
  readonly activation: Activation;
  /** Problems with toolkit folders themselves (e.g. a folder without toolkit.ts). */
  readonly discovery: readonly ExtensionDiagnostic[];
  /** Ids of every discovered, well-formed toolkit (for the toolkit menu). */
  readonly available: readonly string[];
}

export interface ToolkitStart {
  readonly session: ToolkitSession;
  readonly startup: StartupDesign;
}

/** `?toolkit=` from a URL search string, and `VITE_SGL_TOOLKIT` from the environment. */
export function readToolkitRequest(search: string, env: string | undefined): ToolkitRequest {
  return { query: new URLSearchParams(search).get('toolkit'), env: env ?? null };
}

/** URL search string that selects `toolkitId`, keeping any other parameters. */
export function searchWithToolkit(search: string, toolkitId: string): string {
  const params = new URLSearchParams(search);
  params.set('toolkit', toolkitId);
  return `?${params.toString()}`;
}

/** Activate the requested toolkit and resolve the design to show. Never throws, never runs algorithms. */
export async function startToolkit(
  globs: ToolkitGlobs,
  request: ToolkitRequest,
  builtIn: { readonly doc: DesignDocumentV2; readonly source: string },
): Promise<ToolkitStart> {
  const { activation, discovery } = await activate(globs, request);
  const available = discoverToolkits(globs).toolkits.map((p) => p.id);
  return { session: { activation, discovery, available }, startup: resolveStartupDesign(activation, builtIn) };
}

export const activeToolkitOf = (session: ToolkitSession | null): ActiveToolkit | null =>
  session?.activation.status === 'active' ? session.activation.toolkit : null;

export type HeadlineTone = 'ok' | 'warning' | 'error';

export interface ToolkitHeadline {
  readonly tone: HeadlineTone;
  readonly title: string;
  /** Additional explanation shown under the title, if any. */
  readonly detail?: string;
}

const count = (n: number, what: string) => `${n} ${what}${n === 1 ? '' : 's'}`;

/** One-line description of the session for the toolkit bar. */
export function toolkitHeadline(session: ToolkitSession, docLoaded: boolean): ToolkitHeadline {
  const { activation } = session;
  if (activation.status === 'none') {
    return { tone: 'ok', title: 'No toolkit', detail: 'No toolkit is selected; the built-in example is shown.' };
  }
  if (activation.status === 'failed') {
    return {
      tone: 'error',
      title: `Toolkit “${activation.toolkitId}” could not be activated`,
      detail: 'Its types and algorithms are not available. The built-in example is shown instead; fix the problems below and reload.',
    };
  }
  const { toolkit } = activation;
  const errors = toolkit.diagnostics.filter((d) => d.severity === 'error').length;
  const title = `${toolkit.definition.name}`;
  if (!docLoaded) {
    return { tone: 'error', title, detail: 'The toolkit’s default design could not be loaded, so no design is open. See the problems below.' };
  }
  return errors > 0
    ? { tone: 'error', title, detail: `${count(errors, 'problem')} in the toolkit’s files: the affected definitions are disabled.` }
    : { tone: 'ok', title };
}

/** Every activation/discovery diagnostic to show persistently, errors first. */
export function sessionDiagnostics(session: ToolkitSession): ExtensionDiagnostic[] {
  const { activation } = session;
  const own =
    activation.status === 'active' ? activation.toolkit.diagnostics : activation.status === 'failed' ? activation.diagnostics : [];
  const rank = { error: 0, warning: 1, info: 2 } as const;
  return [...session.discovery, ...own].sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export const DISCARD_PROMPT =
  'The current design has changes that have not been exported. Switching will discard them.\n\nUse Project › Export project first to keep them. Discard the changes?';

const uploadLoads = new WeakMap<StoredToolkit, Promise<UploadedToolkitLoad>>();

/** Load an uploaded toolkit once per stored version (the same object is kept while the project is open). */
export function loadUploadedToolkitCached(stored: StoredToolkit, load: (stored: StoredToolkit) => Promise<UploadedToolkitLoad> = loadUploadedToolkit): Promise<UploadedToolkitLoad> {
  let pending = uploadLoads.get(stored);
  if (!pending) uploadLoads.set(stored, (pending = load(stored)));
  return pending;
}

/** The activation of a project's UPLOADED toolkit (2026-11-26), as a session like a repository toolkit's. */
export function uploadedToolkitSession(stored: StoredToolkit, result: UploadedToolkitLoad, available: readonly string[]): ToolkitSession {
  const activation: Activation = result.ok
    ? { status: 'active', toolkit: result.toolkit }
    : {
        status: 'failed',
        toolkitId: stored.name,
        diagnostics: result.problems.map((message, n) => diagnostic('module-load-failed', 'error', { kind: 'toolkit', id: stored.name }, message, { detail: String(n) })),
      };
  return { activation, discovery: [], available };
}
