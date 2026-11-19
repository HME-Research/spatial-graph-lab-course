import { defineGraphAlgorithm, edgesBetween, getEdge, getNode, incidentEdges, neighbours, opposite, type GraphAlgorithmContext } from '@student-api';

/**
 * Uploaded analyses, step 2 (Programme P4, item I): evaluating the compiled code. This module runs
 * INSIDE the upload Web Worker (`uploadWorker.ts`); tests call `handleUploadRequest` directly.
 *
 * - The code is evaluated as a CommonJS-style module whose only `require` is `@student-api`, served
 *   by a SHIM that offers exactly what a graph analysis needs: `defineGraphAlgorithm` and the graph
 *   helpers. `defineSpatialAlgorithm`, `defineToolkit` and `defineNodeType` throw a readable
 *   refusal; any other name throws "not available" (types were already erased by Sucrase).
 * - The worker receives only ids and endpoints (the same `Graph` a toolkit analysis gets) and the
 *   picked inputs; replies are plain data. The main thread validates every reply again
 *   (`algorithmDefinitionSchema`, `checkAnalysisInputs`, `validateAnalysisResult`).
 *
 * Isolation, not a security sandbox: the worker has no document, DOM, storage or app state, and it
 * is terminated after a timeout, but students should still upload only their own code.
 */

export const SPATIAL_REFUSAL = 'Uploaded algorithms can only analyse the graph; transforms must live in a toolkit folder.';
const DEFINITION_HINT = 'An uploaded file must end with `export default defineGraphAlgorithm({ id, label, inputs, run })`.';

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
  defineSpatialAlgorithm: refuse(SPATIAL_REFUSAL),
  defineToolkit: refuse('Uploaded files can only define one graph analysis (defineGraphAlgorithm); a toolkit lives in a toolkit folder.'),
  defineNodeType: refuse('Uploaded files can only define one graph analysis (defineGraphAlgorithm); node types live in a toolkit folder.'),
});

/** Names an analysis can use, for the "not available" message. */
export const SHIM_NAMES: readonly string[] = ['defineGraphAlgorithm', 'neighbours', 'incidentEdges', 'edgesBetween', 'getNode', 'getEdge', 'opposite'];

const shim: object = new Proxy(SHIM_API, {
  get(target, name) {
    if (name === '__esModule') return true;
    if (typeof name === 'symbol' || name === 'then') return undefined;
    if (Object.prototype.hasOwnProperty.call(target, name)) return target[name];
    throw new UploadRefusal(`"${name}" from @student-api is not available in an uploaded analysis (it sees only node ids and edges). Available: ${SHIM_NAMES.join(', ')}.`);
  },
});

/** Requests the worker accepts. `code` is the compiled module (see `compileUpload`). */
export type UploadRequest =
  | { readonly op: 'load'; readonly code: string; readonly fileName: string }
  | {
      readonly op: 'run';
      readonly code: string;
      readonly fileName: string;
      /** Ids, endpoints and the graph policy only (`buildGraphContext`). */
      readonly graph: GraphAlgorithmContext['graph'];
      readonly inputs: readonly number[];
    };

export type UploadReply =
  /** The definition's plain data (everything but `run` and `scope`), to be validated by the caller. */
  | { readonly ok: true; readonly op: 'load'; readonly definition: Readonly<Record<string, unknown>> }
  /** The raw result of `run`, to be validated by the caller. */
  | { readonly ok: true; readonly op: 'run'; readonly result: unknown }
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
  const stack = typeof (error as { stack?: unknown })?.stack === 'string' ? (error as { stack: string }).stack : '';
  const match = new RegExp(`${SOURCE_URL.replace(/\./g, '\\.')}:(\\d+)(?::\\d+)?`).exec(stack);
  if (!match) return undefined;
  const line = Number(match[1]) - offset;
  return line >= 1 ? line : undefined;
}

/** A thrown value as one readable line, with the line number of the student's file when known. */
function describeError(error: unknown, where: string): string {
  if (error instanceof UploadRefusal) return error.message;
  const text = error instanceof Error ? `${error.name}: ${error.message}` : `threw ${typeof error === 'string' ? JSON.stringify(error) : String(error)}`;
  const line = lineOf(error, functionLineOffset());
  return `${where}${line !== undefined ? ` (line ${line})` : ''}: ${text}`;
}

/** Evaluate the compiled module and return its default export. */
function evaluate(code: string): unknown {
  const module: { exports: Record<string, unknown> } = { exports: {} };
  const require = (specifier: unknown) => {
    if (specifier === '@student-api') return shim;
    throw new UploadRefusal(`This file imports "${String(specifier)}". Uploaded analyses may import only "@student-api".`);
  };
  // `code` starts with Sucrase's "use strict" and keeps the student's line numbers.
  const body = new Function('require', 'exports', 'module', `${code}\n//# sourceURL=${SOURCE_URL}`);
  body(require, module.exports, module);
  return module.exports.default;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The default export as a graph analysis definition, or a readable refusal. */
function definitionOf(value: unknown): { readonly ok: true; readonly run: (ctx: GraphAlgorithmContext) => unknown; readonly data: Record<string, unknown> } | { readonly ok: false; readonly message: string } {
  if (!isObject(value)) return { ok: false, message: `There is no analysis in this file. ${DEFINITION_HINT}` };
  if (value.scope === 'spatial') return { ok: false, message: SPATIAL_REFUSAL };
  if (value.scope !== 'graph') return { ok: false, message: `The default export is not a graph analysis. ${DEFINITION_HINT}` };
  const { run, scope: _scope, ...data } = value;
  if (typeof run !== 'function') return { ok: false, message: 'run must be a function: run({ graph, inputs }) { … return { kind: "analysis", … }; }' };
  return { ok: true, run: run as (ctx: GraphAlgorithmContext) => unknown, data };
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

/** Load (`op: 'load'`) or run (`op: 'run'`) an uploaded analysis. Never throws. */
export function handleUploadRequest(request: UploadRequest): UploadReply {
  let exported: unknown;
  try {
    exported = evaluate(request.code);
  } catch (error) {
    return { ok: false, message: describeError(error, error instanceof SyntaxError ? 'The file could not be read' : 'The file failed while loading') };
  }
  const definition = definitionOf(exported);
  if (!definition.ok) return definition;
  if (request.op === 'load') {
    const data = plain(definition.data, 'Besides run, the definition');
    return data.ok ? { ok: true, op: 'load', definition: data.value as Record<string, unknown> } : data;
  }
  let raw: unknown;
  try {
    const graph = { policy: { ...request.graph.policy }, nodes: request.graph.nodes.map((n) => ({ id: n.id })), edges: request.graph.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })) };
    raw = definition.run(freezeDeep({ graph, inputs: [...request.inputs] }));
  } catch (error) {
    return { ok: false, message: describeError(error, 'run failed') };
  }
  const result = plain(raw, 'The result');
  return result.ok ? { ok: true, op: 'run', result: result.value } : result;
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
