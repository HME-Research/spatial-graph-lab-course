import {
  defineDesignAnalysis,
  defineFunction,
  defineGraphAlgorithm,
  defineSpatialAlgorithm,
  defineToolkit,
  edgesBetween,
  FACE_DIRECTIONS,
  getEdge,
  getNode,
  incidentEdges,
  neighbourCell,
  neighbours,
  opposite,
  roomCells,
  type AttributeValue,
  type GraphAlgorithmContext,
  type SpatialNode,
} from '@student-api';
import { designAnalysisContext, tableMetricReader, type DesignAnalysisData, type MetricTable } from './designAnalysisContext';
import { resolveToolkitImport } from './toolkitModules';
import { uploadedTransformContext, type TransformRunData } from './transformContext';
import { ANALYSIS_REFUSAL, SPATIAL_REFUSAL, type UploadKind } from './uploadSource';

export { ANALYSIS_REFUSAL, SPATIAL_REFUSAL };

/**
 * Uploaded analyses and transforms, step 2 (Programme P4, item I; transforms 2026-11-25): evaluating
 * the compiled code. This module runs INSIDE the upload Web Worker (`uploadWorker.ts`); tests call
 * `handleUploadRequest` directly.
 *
 * - The code is evaluated as a CommonJS-style module whose only `require` is `@student-api`, served
 *   by ONE SHIM for both upload surfaces: `defineGraphAlgorithm`, `defineDesignAnalysis`,
 *   `defineSpatialAlgorithm`, the graph helpers and the grid helpers (`roomCells`, `neighbourCell`,
 *   `FACE_DIRECTIONS`). `defineToolkit` and `defineFunction` throw a readable refusal; any other name
 *   throws "not available" (types were already erased by Sucrase).
 * - The UPLOAD SURFACE decides what is accepted (`surface` of a load): Analyse takes only analyses
 *   (a transform is refused with `SPATIAL_REFUSAL`, pointing to Transform), Transform only
 *   transforms (an analysis is refused with `ANALYSIS_REFUSAL`, pointing to Analyse).
 * - An uploaded transform (`op: 'transform'`) receives `TransformRunData` (plain data built by the
 *   main thread, never the document) and its validated parameters; its context
 *   (`uploadedTransformContext`) answers like the toolkit context, except `customOf` (refused).
 * - A graph analysis receives only ids and endpoints (the same `Graph` a toolkit analysis gets) and
 *   the picked inputs. A design analysis (owner 2026-11-20) receives `DesignAnalysisData` (rooms
 *   with only the custom fields it lists in `uses`) and every calculated value as a table, both
 *   built by the main thread; never the document itself. Replies are plain data. The main thread validates every reply again
 *   (`algorithmDefinitionSchema`, `checkAnalysisInputs`, `validateAnalysisResult`).
 *
 * Isolation, not a security sandbox: the worker has no document, DOM, storage or app state, and it
 * is terminated after a timeout, but students should still upload only their own code.
 */

const DEFINITION_HINT =
  'An uploaded file must end with `export default defineGraphAlgorithm({ id, label, inputs, run })` or `export default defineDesignAnalysis({ id, label, inputs, run })`.';
const TRANSFORM_HINT = 'An uploaded transform must end with `export default defineSpatialAlgorithm({ id, label, parameters, run })`.';

/** Thrown for a rule of uploaded analyses (shown as is, without "Error:"). */
class UploadRefusal extends Error {}

const refuse = (message: string) => () => {
  throw new UploadRefusal(message);
};

/** What `@student-api` offers inside the worker. */
const SHIM_API: Readonly<Record<string, unknown>> = Object.freeze({
  defineGraphAlgorithm,
  neighbours,
  incidentEdges,
  edgesBetween,
  getNode,
  getEdge,
  opposite,
  defineDesignAnalysis,
  roomCells,
  neighbourCell,
  FACE_DIRECTIONS,
  defineSpatialAlgorithm,
  defineToolkit: refuse('An uploaded file defines one analysis or one transform; a toolkit lives in a toolkit folder.'),
  defineFunction: refuse('An uploaded file defines one analysis or one transform; Functions live in a toolkit folder (or add them in the app with + Function).'),
});

/** Names a graph analysis can use (what the graph-only AI kit declares). */
export const GRAPH_SHIM_NAMES: readonly string[] = ['defineGraphAlgorithm', 'neighbours', 'incidentEdges', 'edgesBetween', 'getNode', 'getEdge', 'opposite'];

/** Names an uploaded analysis can use (what the design AI kit declares). */
export const SHIM_NAMES: readonly string[] = [...GRAPH_SHIM_NAMES, 'defineDesignAnalysis', 'roomCells', 'neighbourCell', 'FACE_DIRECTIONS'];

/** Names an uploaded transform can use (what the transform AI kit declares). */
export const TRANSFORM_SHIM_NAMES: readonly string[] = ['defineSpatialAlgorithm', ...GRAPH_SHIM_NAMES.slice(1), 'roomCells', 'neighbourCell', 'FACE_DIRECTIONS'];

/** Every name the shim offers, for the "not available" message. */
const ALL_SHIM_NAMES: readonly string[] = [...new Set([...SHIM_NAMES, ...TRANSFORM_SHIM_NAMES])];

const shim: object = new Proxy(SHIM_API, {
  get(target, name) {
    if (name === '__esModule') return true;
    if (typeof name === 'symbol' || name === 'then') return undefined;
    if (Object.prototype.hasOwnProperty.call(target, name)) return target[name];
    throw new UploadRefusal(`"${name}" from @student-api is not available in an uploaded analysis or transform. Available: ${ALL_SHIM_NAMES.join(', ')}.`);
  },
});

/**
 * What `@student-api` offers to an UPLOADED TOOLKIT (owner 2026-11-26): everything a repository
 * toolkit can use at run time, including `defineToolkit` and `defineFunction`.
 */
const TOOLKIT_SHIM_API: Readonly<Record<string, unknown>> = Object.freeze({ ...SHIM_API, defineToolkit, defineFunction });

const toolkitShim: object = new Proxy(TOOLKIT_SHIM_API, {
  get(target, name) {
    if (name === '__esModule') return true;
    if (typeof name === 'symbol' || name === 'then') return undefined;
    if (Object.prototype.hasOwnProperty.call(target, name)) return target[name];
    throw new UploadRefusal(`"${name}" from @student-api is not available in an uploaded toolkit. Available: ${Object.keys(TOOLKIT_SHIM_API).join(', ')}.`);
  },
});

/** The compiled files of an uploaded toolkit: path (`<name>/functions/kitchen.ts`) → compiled module. */
export type ToolkitModules = Readonly<Record<string, string>>;

/** One file of an uploaded toolkit after loading: its default export as plain data, or why it failed. */
export type LoadedToolkitFile =
  /** `value`: the default export without `run` (absent: no default export); `hasRun`: `run` was a function. */
  | { readonly ok: true; readonly value?: unknown; readonly hasRun?: boolean }
  | { readonly ok: false; readonly message: string };

/** Requests the worker accepts. `code` is the compiled module (see `compileUpload`). */
export type UploadRequest =
  /** Load the definition. `surface`: where it was uploaded (absent: Analyse). */
  | { readonly op: 'load'; readonly code: string; readonly fileName: string; readonly surface?: UploadKind }
  /** Load every definition file of an uploaded toolkit (2026-11-26). */
  | { readonly op: 'loadToolkit'; readonly modules: ToolkitModules; readonly files: readonly string[] }
  | {
      readonly op: 'run';
      readonly code: string;
      readonly fileName: string;
      /** An uploaded toolkit's algorithm: every module of the toolkit; `fileName` is the algorithm's path in it. */
      readonly modules?: ToolkitModules;
      /** Ids, endpoints and the graph policy only (`buildGraphContext`). */
      readonly graph: GraphAlgorithmContext['graph'];
      readonly inputs: readonly number[];
      /** For a design analysis: what it may see (`buildDesignAnalysisData`) and every calculated value. */
      readonly design?: { readonly data: DesignAnalysisData; readonly metrics: MetricTable };
    }
  | {
      /** Run an uploaded transform (2026-11-25): plain data only (`buildTransformRunData`) and the validated parameters. */
      readonly op: 'transform';
      readonly code: string;
      readonly fileName: string;
      /** An uploaded toolkit's transform: every module, and its Function files (for `ctx.customOf`). */
      readonly modules?: ToolkitModules;
      readonly functionFiles?: readonly string[];
      readonly data: TransformRunData;
      readonly params: { readonly [key: string]: AttributeValue };
    };

export type UploadReply =
  /** The definition's plain data (everything but `run`; `scope` is "graph" or "design", or "spatial" on the Transform surface), to be validated by the caller. */
  | { readonly ok: true; readonly op: 'load'; readonly definition: Readonly<Record<string, unknown>> }
  /** The raw result of `run` (an analysis or a transformation), to be validated by the caller. */
  | { readonly ok: true; readonly op: 'run'; readonly result: unknown }
  /** Every requested file of an uploaded toolkit, loaded or not. */
  | { readonly ok: true; readonly op: 'loadToolkit'; readonly files: Readonly<Record<string, LoadedToolkitFile>> }
  | { readonly ok: false; readonly message: string };

/** Name used in stack traces of uploaded code (`//# sourceURL`), so its line numbers can be found. */
const SOURCE_URL = 'uploaded-analysis.js';

let lineOffset: number | undefined;
/** How many lines the engine adds before a `new Function` body (V8: 2), measured once. */
function functionLineOffset(): number {
  if (lineOffset === undefined) {
    lineOffset = 0;
    try {
      new Function(`throw new Error('probe');\n//# sourceURL=${SOURCE_URL}`)();
    } catch (error) {
      const line = lineOf(error, 0);
      if (line !== undefined) lineOffset = line - 1;
    }
  }
  return lineOffset;
}

function lineOf(error: unknown, offset: number): number | undefined {
  return placeOf(error, offset)?.line;
}

/** Prefix of the source URL of an uploaded toolkit's module (followed by its encoded path). */
const TOOLKIT_SOURCE_URL = 'uploaded-toolkit/';

/** Where in the student's files an error was thrown: the toolkit file (if any) and the line. */
function placeOf(error: unknown, offset: number): { readonly file?: string; readonly line: number } | undefined {
  const stack = typeof (error as { stack?: unknown })?.stack === 'string' ? (error as { stack: string }).stack : '';
  const match = /uploaded-(?:analysis\.js|toolkit\/([^\s:()]+)):(\d+)(?::\d+)?/.exec(stack);
  if (!match) return undefined;
  const line = Number(match[2]) - offset;
  if (line < 1) return undefined;
  return match[1] !== undefined ? { file: decodeURIComponent(match[1]), line } : { line };
}

/** A thrown value as one readable line, with the line number of the student's file when known. */
function describeError(error: unknown, where: string): string {
  if (error instanceof UploadRefusal) return error.message;
  const text = error instanceof Error ? `${error.name}: ${error.message}` : `threw ${typeof error === 'string' ? JSON.stringify(error) : String(error)}`;
  const place = placeOf(error, functionLineOffset());
  const at = place === undefined ? '' : place.file !== undefined ? ` (${place.file}, line ${place.line})` : ` (line ${place.line})`;
  return `${where}${at}: ${text}`;
}

/** Evaluate the compiled module and return its default export. */
function evaluate(code: string): unknown {
  const module: { exports: Record<string, unknown> } = { exports: {} };
  const require = (specifier: unknown) => {
    if (specifier === '@student-api') return shim;
    throw new UploadRefusal(`This file imports "${String(specifier)}". Uploaded files may import only "@student-api".`);
  };
  // `code` starts with Sucrase's "use strict" and keeps the student's line numbers.
  const body = new Function('require', 'exports', 'module', `${code}\n//# sourceURL=${SOURCE_URL}`);
  body(require, module.exports, module);
  return module.exports.default;
}

/**
 * Evaluate the modules of an uploaded toolkit, CommonJS style: `require` serves the toolkit shim
 * for `@student-api` and the toolkit's own files by relative path (the main thread has already
 * refused every other import). Each module is evaluated once; a cycle sees the partial exports.
 */
function moduleLoader(modules: ToolkitModules): (path: string) => Record<string, unknown> {
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  const load = (path: string): Record<string, unknown> => {
    const cached = cache.get(path);
    if (cached) return cached.exports;
    const code = modules[path];
    if (code === undefined) throw new UploadRefusal(`${path} is not a file of the toolkit.`);
    const module: { exports: Record<string, unknown> } = { exports: {} };
    cache.set(path, module);
    const require = (specifier: unknown) => {
      if (specifier === '@student-api') return toolkitShim;
      const target = typeof specifier === 'string' ? resolveToolkitImport(path, specifier, (p) => Object.prototype.hasOwnProperty.call(modules, p)) : null;
      if (target === null) throw new UploadRefusal(`${path} imports "${String(specifier)}". Toolkit files may import only "@student-api" and the toolkit's own files.`);
      return load(target);
    };
    const body = new Function('require', 'exports', 'module', `${code}\n//# sourceURL=${TOOLKIT_SOURCE_URL}${encodeURIComponent(path)}`);
    body(require, module.exports, module);
    return module.exports;
  };
  return load;
}

/** Load every requested file of an uploaded toolkit (`op: 'loadToolkit'`). Never throws. */
function loadToolkitFiles(modules: ToolkitModules, files: readonly string[]): Record<string, LoadedToolkitFile> {
  const load = moduleLoader(modules);
  const out: Record<string, LoadedToolkitFile> = {};
  for (const file of files) {
    let exported: Record<string, unknown>;
    try {
      exported = load(file);
    } catch (error) {
      out[file] = { ok: false, message: describeError(error, error instanceof SyntaxError ? 'The file could not be read' : 'The file failed while loading') };
      continue;
    }
    if (!('default' in exported)) {
      out[file] = { ok: true };
      continue;
    }
    const value = exported.default;
    const run = isObject(value) ? value.run : undefined;
    const data = isObject(value) && 'run' in value ? Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'run')) : value;
    const copy = plain(data, `The default export of ${file}${run !== undefined ? ' (besides run)' : ''}`);
    out[file] = copy.ok ? { ok: true, value: copy.value, ...(run !== undefined && { hasRun: typeof run === 'function' }) } : { ok: false, message: copy.message };
  }
  return out;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The default export as a definition the upload surface accepts (Analyse: a graph or design
 * analysis; Transform: a spatial algorithm), or a readable refusal that names the other surface.
 */
function definitionOf(
  value: unknown,
  surface: UploadKind,
): { readonly ok: true; readonly scope: 'graph' | 'design' | 'spatial'; readonly run: (ctx: unknown) => unknown; readonly data: Record<string, unknown> } | { readonly ok: false; readonly message: string } {
  const transform = surface === 'transform';
  if (!isObject(value)) return { ok: false, message: transform ? `There is no transform in this file. ${TRANSFORM_HINT}` : `There is no analysis in this file. ${DEFINITION_HINT}` };
  const analysis = value.scope === 'graph' || value.scope === 'design';
  if (transform && analysis) return { ok: false, message: ANALYSIS_REFUSAL };
  if (!transform && value.scope === 'spatial') return { ok: false, message: SPATIAL_REFUSAL };
  if (transform && value.scope !== 'spatial') return { ok: false, message: `The default export is not a transform. ${TRANSFORM_HINT}` };
  if (!transform && !analysis) return { ok: false, message: `The default export is not an analysis. ${DEFINITION_HINT}` };
  const { run, ...data } = value;
  if (typeof run !== 'function') {
    return { ok: false, message: transform ? 'run must be a function: run(ctx) { … return { kind: "transformation", operations }; }' : 'run must be a function: run(ctx) { … return { kind: "analysis", … }; }' };
  }
  return { ok: true, scope: value.scope as 'graph' | 'design' | 'spatial', run: run as (ctx: unknown) => unknown, data };
}

/** A copy that can cross to the main thread, or a readable problem. */
function plain(value: unknown, what: string): { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly message: string } {
  try {
    return { ok: true, value: structuredClone(value) };
  } catch {
    return { ok: false, message: `${what} may contain only plain data (numbers, text, lists, objects), not functions or class instances.` };
  }
}

function freezeDeep<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) freezeDeep(v);
  }
  return value;
}

/** Load (`op: 'load'`) or run an uploaded analysis (`op: 'run'`) or transform (`op: 'transform'`). Never throws. */
export function handleUploadRequest(request: UploadRequest): UploadReply {
  if (request.op === 'loadToolkit') return { ok: true, op: 'loadToolkit', files: loadToolkitFiles(request.modules, request.files) };
  const modules = request.op === 'load' ? undefined : request.modules;
  const load = modules ? moduleLoader(modules) : undefined;
  let exported: unknown;
  try {
    exported = load ? load(request.fileName).default : evaluate(request.code);
  } catch (error) {
    return { ok: false, message: describeError(error, error instanceof SyntaxError ? 'The file could not be read' : 'The file failed while loading') };
  }
  const surface: UploadKind = request.op === 'transform' ? 'transform' : request.op === 'run' ? 'analysis' : (request.surface ?? 'analysis');
  const definition = definitionOf(exported, surface);
  if (!definition.ok) return definition;
  if (request.op === 'load') {
    const data = plain(definition.data, 'Besides run, the definition');
    return data.ok ? { ok: true, op: 'load', definition: data.value as Record<string, unknown> } : data;
  }
  let raw: unknown;
  try {
    if (request.op === 'transform') {
      const fail = (message: string) => new UploadRefusal(message);
      const metrics = tableMetricReader(request.data.metrics, (_code, message) => fail(message));
      // An uploaded toolkit's transform may use ctx.customOf with its own Functions (by identity, as in the app).
      const functionIds = new Map<unknown, string>();
      if (load) {
        for (const file of request.functionFiles ?? []) {
          const fn = load(file).default;
          if (isObject(fn) && typeof fn.id === 'string') functionIds.set(fn, fn.id);
        }
      }
      const customOf = load ? toolkitCustomOf(request.data, functionIds, fail) : undefined;
      raw = definition.run(uploadedTransformContext(request.data, request.params, metrics, fail, customOf));
    } else if (definition.scope === 'design') {
      if (!request.design) return { ok: false, message: 'This design analysis was started without the design.' };
      const metrics = tableMetricReader(request.design.metrics, (_code, message) => new UploadRefusal(message));
      raw = definition.run(designAnalysisContext(request.design.data, request.inputs, metrics));
    } else {
      const graph = { policy: { ...request.graph.policy }, nodes: request.graph.nodes.map((n) => ({ id: n.id })), edges: request.graph.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })) };
      raw = definition.run(freezeDeep({ graph, inputs: [...request.inputs] }));
    }
  } catch (error) {
    return { ok: false, message: describeError(error, 'run failed') };
  }
  const result = plain(raw, 'The result');
  return result.ok ? { ok: true, op: 'run', result: result.value } : result;
}

/**
 * `ctx.customOf(node, fn)` of an uploaded toolkit's transform: `fn` must be the default export of
 * one of the toolkit's Function files (identity), valid, and the node's Function; the values were
 * computed by the main thread with the app's own `customOf` (`TransformRunData.customOf`).
 */
function toolkitCustomOf(data: TransformRunData, functionIds: ReadonlyMap<unknown, string>, fail: (message: string) => Error) {
  const values = new Map((data.customOf?.values ?? []).map(([id, v]) => [id, v] as const));
  const broken = new Map(data.customOf?.broken ?? []);
  return (node: SpatialNode, fn: unknown): { readonly [key: string]: AttributeValue } => {
    const id = functionIds.get(fn);
    const name = isObject(fn) && typeof fn.id === 'string' ? `"${fn.id}"` : 'the given value';
    if (id === undefined) throw fail(`customOf: ${name} is not a function definition registered by toolkit "${data.customOf?.toolkit ?? ''}" (import it from the toolkit's functions/ folder)`);
    const problem = broken.get(id);
    if (problem !== undefined) throw fail(`customOf: function "${id}" (${problem}) is invalid, so algorithms cannot use it`);
    if (node?.function !== id) throw fail(`customOf: node "${node?.id}" has function "${node?.function}", not "${id}"`);
    return freezeDeep(structuredClone(values.get(node.id) ?? {}));
  };
}

/**
 * Remove network, storage and worker-spawning globals from the worker before any uploaded code
 * runs (defence in depth: the worker never receives the document or app state anyway).
 */
export function lockDownWorkerGlobals(scope: object): void {
  const names = ['fetch', 'XMLHttpRequest', 'WebSocket', 'WebTransport', 'EventSource', 'indexedDB', 'caches', 'importScripts', 'BroadcastChannel', 'Worker', 'SharedWorker'];
  for (let target: object | null = scope; target !== null && target !== Object.prototype; target = Object.getPrototypeOf(target) as object | null) {
    for (const name of names) {
      if (!Object.prototype.hasOwnProperty.call(target, name) && target !== scope) continue;
      try {
        Object.defineProperty(target, name, { value: undefined, writable: false, configurable: false });
      } catch {
        // A non-configurable global stays; the worker still has no document or app state.
      }
    }
  }
}
