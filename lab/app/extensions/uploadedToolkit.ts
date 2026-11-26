import type { DesignDocumentV2 } from '@app/document';
import type { AnalysisInput, AnalysisUses, ParameterSpecs } from '@student-api';
import { activateToolkit, type ActiveToolkit, type RegisteredAlgorithm } from './activate';
import { checkConformance } from './conformance';
import { buildSpatialContextV2, type GraphSource } from './context';
import { diagnostic, fail, type ExtensionDiagnostic, type ExtensionResult } from './diagnostics';
import type { ModuleLoader, SourceFile, TextLoader, ToolkitSource, UrlLoader } from './discover';
import { EMPTY_ATTRIBUTE_SCHEMA } from './projectAttributes';
import { isProjectFunction } from './projectFunctions';
import type { RunOutcomeV2 } from './run';
import { resolveToolkitImport } from './toolkitModules';
import type { TransformRunData } from './transformContext';
import { browserWorker, runUploadedAnalysis, workerRunner, type DesignRunSource, type UploadRunner, type UploadRunOutcome } from './uploadedAnalyses';
import { defaultTransformRunner, runUploadedTransform, type UploadedTransformRunOptions } from './uploadedTransforms';
import { fromBase64, type StoredToolkit, type StoredToolkitFile } from './uploadedToolkitFiles';
import type { LoadedToolkitFile } from './uploadSandbox';
import { importedModulesWithLines, transpile } from './uploadSource';

/**
 * Uploaded toolkits, step 2 (owner 2026-11-26): from the stored files (`StoredToolkit`, see
 * `uploadedToolkitFiles.ts`) to an `ActiveToolkit` — the SAME activation and validation a
 * repository toolkit gets (`activateToolkit`: toolkit definition, Functions, attributes,
 * algorithms, designs; then the designs' conformance, as `npm run check:toolkit` does).
 *
 * - Every `.ts` file is checked for its imports first (only `@student-api` and the toolkit's own
 *   files, by relative path; anything else is refused naming the file and line), then compiled with
 *   Sucrase. Nothing runs on the main thread: the upload Web Worker evaluates the modules
 *   (`op: 'loadToolkit'`) and returns each default export as plain data; `run` stays in the worker.
 * - The activation's loaders hand those plain definitions to `activateToolkit`; an algorithm's
 *   `run` is a stand-in that refuses, because an uploaded toolkit's algorithms run in the worker
 *   (`runUploadedToolkitAnalysis`, `runUploadedToolkitTransform`, through the single-file upload
 *   runners, with the toolkit's modules).
 * - The upload is refused when any file has a problem (an error diagnostic or a conformance error),
 *   so a student fixes it and uploads again; warnings are returned to be shown.
 * - Façade files (`assets/*.3dm`) are kept as bytes and imported with the normal façade import when
 *   an example that uses one is opened (`uploadedToolkitAssets`), exactly like a repository toolkit's.
 */

/** A loaded uploaded toolkit, or every problem (file and message) in plain words. */
export type UploadedToolkitLoad =
  | { readonly ok: true; readonly toolkit: ActiveToolkit; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly problems: readonly string[] };

/** Loading a whole toolkit may take longer than one file. */
export const TOOLKIT_LOAD_TIMEOUT_MS = 6000;

let sharedRunner: UploadRunner | undefined;
/** The app's runner for loading uploaded toolkits (real Web Workers), created on first use. */
export const defaultToolkitLoadRunner: UploadRunner = (request) => (sharedRunner ??= workerRunner(browserWorker, TOOLKIT_LOAD_TIMEOUT_MS, 'toolkit'))(request);

const isTs = (path: string) => path.endsWith('.ts');
const display = (name: string, path: string) => `${name}/${path}`;

/** Problems of the imports of one file (empty when every import is allowed). */
export function toolkitImportProblems(file: string, source: string, exists: (path: string) => boolean): string[] {
  const problems: string[] = [];
  for (const { specifier, line } of importedModulesWithLines(source)) {
    if (specifier === '@student-api') continue;
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      if (resolveToolkitImport(file, specifier, exists) === null) {
        problems.push(`${file}, line ${line}: imports "${specifier}", but the toolkit has no such file (a path is relative to this file, e.g. "../functions/kitchen").`);
      }
      continue;
    }
    problems.push(`${file}, line ${line}: imports "${specifier}". Toolkit files may import only "@student-api" and the toolkit's own files (e.g. "../functions/kitchen"); no packages and nothing from the app.`);
  }
  return problems;
}

const RUN_IN_WORKER = () => {
  throw new Error('an algorithm of an uploaded toolkit runs in the upload worker, not here');
};

/** A diagnostic as one line naming its file (the messages usually do already). */
function problemLine(d: ExtensionDiagnostic): string {
  const file = d.subject.kind === 'file' ? d.subject.path : null;
  return file !== null && !d.message.includes(file) ? `${file}: ${d.message}` : d.message;
}

/**
 * Check, compile, load (in the worker) and activate an uploaded toolkit. Never throws; nothing is
 * changed. `runner` is the worker runner (a fake in tests).
 */
export async function loadUploadedToolkit(stored: StoredToolkit, runner: UploadRunner = defaultToolkitLoadRunner): Promise<UploadedToolkitLoad> {
  const { name } = stored;
  const byPath = new Map<string, StoredToolkitFile>(stored.files.map((f) => [display(name, f.path), f] as const));
  const has = (path: string) => byPath.has(path) && isTs(path);
  const sources = [...byPath].filter(([path, f]) => isTs(path) && 'text' in f) as [string, { path: string; text: string }][];
  if (!byPath.has(display(name, 'toolkit.ts'))) return { ok: false, problems: [`${name}/toolkit.ts is missing: toolkit.ts must be directly inside the folder ${name}/.`] };

  // 1. Imports, then Sucrase, for every .ts file (helpers in lib/ too).
  const problems: string[] = [];
  const modules: Record<string, string> = {};
  for (const [path, file] of sources) {
    const own = toolkitImportProblems(path, file.text, has);
    if (own.length > 0) {
      problems.push(...own);
      continue;
    }
    const compiled = await transpile(file.text, path);
    if (compiled.ok) modules[path] = compiled.code;
    else problems.push(...compiled.problems.map((p) => `${path}: ${p}`));
  }
  if (problems.length > 0) return { ok: false, problems };

  // 2. Evaluate the definition files in the worker.
  const flat = (folder: string, ext: string) => [...byPath.keys()].filter((p) => new RegExp(`^${name.replace(/[-]/g, '\\-')}/${folder}/[^/]+\\.${ext}$`).test(p) && !p.endsWith('.test.ts')).sort();
  const toolkitFile = display(name, 'toolkit.ts');
  const functionFiles = flat('functions', 'ts');
  const algorithmFiles = flat('algorithms', 'ts');
  const reply = await runner({ op: 'loadToolkit', modules, files: [toolkitFile, ...functionFiles, ...algorithmFiles] });
  if (!reply.ok) return { ok: false, problems: [reply.message] };
  if (reply.op !== 'loadToolkit') return { ok: false, problems: ['The toolkit sent an unexpected reply.'] };
  const loaded = reply.files;

  // 3. The same activation as a repository toolkit.
  const loader =
    (file: string, algorithm: boolean): ModuleLoader =>
    async () => {
      const result: LoadedToolkitFile | undefined = loaded[file];
      if (!result) throw new Error('it was not loaded');
      if (!result.ok) throw new Error(result.message);
      if (!('value' in result)) return {};
      const value = algorithm && result.hasRun === true && typeof result.value === 'object' && result.value !== null ? { ...result.value, run: RUN_IN_WORKER } : result.value;
      return { default: value };
    };
  const source: ToolkitSource = {
    id: name,
    toolkit: { file: toolkitFile, stem: 'toolkit', load: loader(toolkitFile, false) },
    functions: functionFiles.map((file) => ({ file, stem: file.slice(file.lastIndexOf('/') + 1, -3), load: loader(file, false) })),
    algorithms: algorithmFiles.map((file) => ({ file, stem: file.slice(file.lastIndexOf('/') + 1, -3), load: loader(file, true) })),
    designs: flat('designs', 'json').map((file): SourceFile<TextLoader> => {
      const f = byPath.get(file)!;
      return { file, stem: file.slice(file.lastIndexOf('/') + 1, -5), load: async () => ('text' in f ? f.text : '') };
    }),
    assets: uploadedToolkitAssets(stored),
  };
  const activation = await activateToolkit(source);
  if (activation.status === 'failed') return { ok: false, problems: activation.diagnostics.map(problemLine) };
  if (activation.status !== 'active') return { ok: false, problems: [`${name}/toolkit.ts could not be activated.`] };
  const toolkit: ActiveToolkit = { ...activation.toolkit, uploaded: { modules, functionFiles } };

  // 4. Its designs must conform to its Functions (as `npm run check:toolkit` checks).
  const all = [...toolkit.diagnostics];
  for (const design of toolkit.designs) {
    if (!design.result.ok) {
      for (const issue of design.result.issues.slice(0, 5)) problems.push(`${design.file}: ${issue.path.length ? `${issue.path.join('.')}: ` : ''}${issue.message}`);
      continue;
    }
    all.push(...checkConformance(design.result.value, toolkit).map((d) => ({ ...d, message: `${design.file}: ${d.message}` })));
  }
  problems.push(...all.filter((d) => d.severity === 'error').map(problemLine));
  if (problems.length > 0) return { ok: false, problems: [...new Set(problems)] };
  return { ok: true, toolkit, warnings: all.filter((d) => d.severity === 'warning').map(problemLine) };
}

/**
 * The toolkit's façade files as asset sources: `load` gives the file's path, which
 * `uploadedAssetBytes` turns into its bytes (they are already in the project; nothing is fetched).
 */
export function uploadedToolkitAssets(stored: StoredToolkit): SourceFile<UrlLoader>[] {
  return stored.files
    .filter((f) => 'base64' in f && /^assets\/[^/]+\.3dm$/i.test(f.path))
    .map((f) => ({ file: display(stored.name, f.path), stem: f.path.slice('assets/'.length), load: async () => f.path }));
}

/** The bytes of a façade file of `stored` (the `path` its asset source's `load` gives). */
export async function uploadedAssetBytes(stored: StoredToolkit, path: string): Promise<Uint8Array> {
  const file = stored.files.find((f) => f.path === path);
  if (!file || !('base64' in file)) throw new Error(`${path} is not in the uploaded toolkit`);
  return fromBase64(file.base64);
}

const registered = (project: ActiveToolkit, algorithmId: string): RegisteredAlgorithm | undefined => project.algorithms.find((a) => a.id === algorithmId);

/** Run an ANALYSIS of an uploaded toolkit in the worker (the same checks as an uploaded analysis). */
export async function runUploadedToolkitAnalysis(
  project: ActiveToolkit,
  algorithmId: string,
  doc: GraphSource,
  inputs: readonly unknown[],
  design: DesignRunSource,
  runner?: UploadRunner,
): Promise<UploadRunOutcome> {
  const entry = registered(project, algorithmId);
  const uploaded = project.uploaded;
  if (!entry || !uploaded) return { ok: false, messages: [`project "${project.id}" has no algorithm "${algorithmId}"`] };
  if (!entry.status.ok) return { ok: false, messages: [`algorithm "${algorithmId}" (${entry.file}) is invalid and disabled`] };
  const d = entry.definition;
  if (d.scope === 'spatial') return { ok: false, messages: ['This algorithm returned a transformation; it belongs in Transform.'] };
  const code = uploaded.modules[entry.file] ?? '';
  const definition = {
    scope: d.scope,
    id: d.id,
    label: d.label,
    ...(d.description !== undefined && { description: d.description }),
    inputs: d.inputs as readonly AnalysisInput[],
    ...(d.scope === 'design' && d.uses !== undefined && { uses: d.uses as AnalysisUses }),
  };
  return runUploadedAnalysis({ ok: true, definition, code, modules: uploaded.modules }, entry.file, doc, inputs, runner, design);
}

/** What `ctx.customOf` answers in an uploaded toolkit's transform, computed with the app's own `customOf`. */
export function toolkitCustomOfData(doc: DesignDocumentV2, project: ActiveToolkit, options: UploadedTransformRunOptions = {}): NonNullable<TransformRunData['customOf']> {
  const ctx = buildSpatialContextV2(doc, project, 'custom-of', {}, options.attributes ?? project.attributeBaseline?.schema ?? EMPTY_ATTRIBUTE_SCHEMA, options.spatial);
  const own = project.functions.filter((f) => !isProjectFunction(f));
  const values: [number, Readonly<Record<string, never>>][] = [];
  for (const node of ctx.design.nodes) {
    const fn = own.find((f) => f.id === node.function && f.status.ok);
    if (fn) values.push([node.id, ctx.customOf(node, fn.definition) as Readonly<Record<string, never>>]);
  }
  return { toolkit: project.id, values, broken: own.filter((f) => !f.status.ok).map((f) => [f.id, f.file] as const) };
}

/** Run a TRANSFORM of an uploaded toolkit in the worker (the same checks and preview as an uploaded transform). */
export async function runUploadedToolkitTransform(
  doc: DesignDocumentV2,
  project: ActiveToolkit,
  algorithmId: string,
  params: unknown,
  options: UploadedTransformRunOptions = {},
  runner: UploadRunner = defaultTransformRunner,
): Promise<ExtensionResult<RunOutcomeV2>> {
  const entry = registered(project, algorithmId);
  const uploaded = project.uploaded;
  const subject = { kind: 'algorithm', id: algorithmId } as const;
  if (!entry || !uploaded) return fail([diagnostic('unknown-algorithm', 'error', subject, `project "${project.id}" has no algorithm "${algorithmId}"`)]);
  if (!entry.status.ok) return fail([diagnostic('algorithm-disabled', 'error', subject, `algorithm "${algorithmId}" (${entry.file}) is invalid and disabled`)]);
  const d = entry.definition;
  if (d.scope !== 'spatial') return fail([diagnostic('run-failed', 'error', subject, 'This algorithm is an analysis; it belongs in Analyse.')]);
  let customOf: TransformRunData['customOf'];
  try {
    customOf = toolkitCustomOfData(doc, project, options);
  } catch (error) {
    return fail([diagnostic('run-failed', 'error', subject, `The design could not be prepared for "${d.label}": ${error instanceof Error ? error.message : String(error)}`)]);
  }
  const prepared = {
    ok: true as const,
    definition: { id: d.id, label: d.label, parameters: (d.parameters ?? {}) as ParameterSpecs },
    code: uploaded.modules[entry.file] ?? '',
    modules: uploaded.modules,
    functionFiles: uploaded.functionFiles,
  };
  return runUploadedTransform(prepared, entry.file, doc, project, params, { ...options, customOf }, runner);
}
