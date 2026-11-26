import type { DesignDocumentV2 } from '@app/document';
import type { SpatialResolution } from '@app/spatial';
import type { AnalysisInput, AnalysisResult, AnalysisUses, FunctionInfo } from '@student-api';
import { buildDesignAnalysisData, buildGraphContext, buildMetricTable, missingUses, type GraphSource } from './context';
import type { DesignAnalysisData, MetricTable } from './designAnalysisContext';
import type { ProjectAttributeSchema } from './projectAttributes';
import { algorithmDefinitionSchema, zodMessages } from './definitions';
import { checkAnalysisInputs, validateAnalysisResult } from './run';
import type { UploadReply, UploadRequest } from './uploadSandbox';
import { compileUpload, SPATIAL_REFUSAL, type UploadKind } from './uploadSource';

/**
 * Uploaded analyses (Programme P4, item I): a student's own `.ts` graph analysis, stored as SOURCE
 * TEXT in the project file (`settings.uploadedAnalyses`) and compiled again whenever the project is
 * opened. The same file works in `toolkits/<id>/algorithms/`.
 *
 * Pipeline: `compileUpload` (size, imports, Sucrase) → a Web Worker evaluates it (`op: 'load'`)
 * and returns the definition's plain data → validated here with the SAME schema as toolkit
 * analyses. Each run: inputs checked (`checkAnalysisInputs`) → a fresh worker runs it on ids and
 * endpoints only (`op: 'run'`), terminated after `UPLOAD_TIMEOUT_MS` → result validated
 * (`validateAnalysisResult`). Nothing is shown before every check passes; nothing throws.
 */

/** A run (or a load) taking longer than this is stopped and its worker terminated. */
export const UPLOAD_TIMEOUT_MS = 3000;

export const timeoutMessage = (ms: number = UPLOAD_TIMEOUT_MS) => `Stopped after ${Math.round(ms / 100) / 10} s — does it loop forever?`;

/** One uploaded analysis as the project file stores it (source text, never compiled code). */
export interface StoredUpload {
  /** Stable id of the upload (not the analysis id): keeps its place when it is replaced. */
  readonly id: string;
  readonly fileName: string;
  readonly source: string;
  /** ISO time of the upload (or of the last replacement). */
  readonly addedAt: string;
}

/** The validated definition of an uploaded analysis (plain data; `run` stays in the worker). */
export interface UploadedDefinition {
  /** `graph`: ids and endpoints only; `design`: also the rooms themselves (owner 2026-11-20). */
  readonly scope: 'graph' | 'design';
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly inputs: readonly AnalysisInput[];
  /** What a design analysis needs from the project (absent: works in any project). */
  readonly uses?: AnalysisUses;
}

/** What a design analysis runs on besides the document: the project's Functions and fields, and the host's resolution. */
export interface DesignRunSource {
  readonly doc: DesignDocumentV2;
  readonly functions: readonly FunctionInfo[];
  readonly schema: ProjectAttributeSchema;
  readonly spatial?: SpatialResolution;
}

export type UploadStatus =
  | { readonly ok: true; readonly definition: UploadedDefinition; readonly code: string }
  | { readonly ok: false; readonly problems: readonly string[] };

/** Sends one request to a fresh worker and resolves with its reply (or a readable failure). */
export type UploadRunner = (request: UploadRequest) => Promise<UploadReply>;

/** The part of `Worker` the runner uses (a fake in tests). */
export interface WorkerLike {
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onerror: ((event: { readonly message?: string; preventDefault?: () => void }) => void) | null;
  onmessageerror?: ((event: unknown) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

/** The real worker (bundled by Vite: `new Worker(new URL(…), …)` must stay literal). */
export const browserWorker = (): WorkerLike =>
  // Event handler parameter types differ only in detail (DOM events vs the minimal shape used here).
  new Worker(new URL('./uploadWorker.ts', import.meta.url), { type: 'module', name: 'uploaded-analysis' }) as unknown as WorkerLike;

/**
 * A runner that starts one worker per request and terminates it after the reply or the timeout.
 * `kind` only names it in its messages ("The transform stopped with an error…").
 */
export function workerRunner(createWorker: () => WorkerLike = browserWorker, timeoutMs: number = UPLOAD_TIMEOUT_MS, kind: UploadKind = 'analysis'): UploadRunner {
  const The = kind === 'analysis' ? 'The analysis' : 'The transform';
  return (request) =>
    new Promise<UploadReply>((resolve) => {
      let worker: WorkerLike;
      try {
        worker = createWorker();
      } catch (error) {
        resolve({ ok: false, message: `${The} could not be started (${error instanceof Error ? error.message : String(error)}).` });
        return;
      }
      let done = false;
      const finish = (reply: UploadReply) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        worker.onmessage = null;
        worker.onerror = null;
        worker.terminate();
        resolve(reply);
      };
      const timer = setTimeout(() => finish({ ok: false, message: timeoutMessage(timeoutMs) }), timeoutMs);
      worker.onmessage = (event) => finish(isReply(event.data) ? event.data : { ok: false, message: `${The} sent an unreadable reply.` });
      worker.onerror = (event) => {
        event.preventDefault?.();
        finish({ ok: false, message: `${The} stopped with an error${event.message ? `: ${event.message}` : '.'}` });
      };
      worker.onmessageerror = () => finish({ ok: false, message: `${The} sent a reply that could not be read.` });
      try {
        worker.postMessage(request);
      } catch (error) {
        finish({ ok: false, message: `${The} could not be started (${error instanceof Error ? error.message : String(error)}).` });
      }
    });
}

function isReply(value: unknown): value is UploadReply {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { ok?: unknown; message?: unknown; op?: unknown };
  return v.ok === false ? typeof v.message === 'string' : v.ok === true && (v.op === 'load' || v.op === 'run');
}

let sharedRunner: UploadRunner | undefined;
/** The app's runner (real Web Workers), created on first use. */
export const defaultUploadRunner: UploadRunner = (request) => (sharedRunner ??= workerRunner())(request);

/**
 * Compile, load in a worker and validate an uploaded file: the same definition rules as a toolkit
 * graph analysis (strict fields, id pattern, label, optional description, required `inputs`).
 */
export async function prepareUpload(source: string, fileName: string, runner: UploadRunner = defaultUploadRunner): Promise<UploadStatus> {
  const compiled = await compileUpload(source, fileName);
  if (!compiled.ok) return compiled;
  const reply = await runner({ op: 'load', code: compiled.code, fileName });
  if (!reply.ok) return { ok: false, problems: [reply.message] };
  if (reply.op !== 'load') return { ok: false, problems: ['The analysis sent an unexpected reply.'] };
  // `run` and `scope` were checked in the worker; validate everything else exactly as for a toolkit.
  const scope = reply.definition.scope === 'design' ? 'design' : 'graph';
  const parsed = algorithmDefinitionSchema.safeParse({ ...reply.definition, scope, run: () => undefined });
  if (!parsed.success) return { ok: false, problems: zodMessages(parsed.error.issues) };
  if (parsed.data.scope === 'spatial') return { ok: false, problems: [SPATIAL_REFUSAL] };
  const { id, label, description, inputs } = parsed.data;
  const raw = parsed.data.scope === 'design' ? parsed.data.uses : undefined;
  const uses: AnalysisUses | undefined = raw && {
    ...(raw.functions !== undefined && { functions: raw.functions }),
    ...(raw.nodeFields !== undefined && { nodeFields: raw.nodeFields }),
    ...(raw.edgeFields !== undefined && { edgeFields: raw.edgeFields }),
  };
  return {
    ok: true,
    code: compiled.code,
    definition: {
      scope: parsed.data.scope,
      id,
      label,
      ...(description !== undefined && { description }),
      inputs: inputs as readonly AnalysisInput[],
      ...(uses !== undefined && { uses }),
    },
  };
}

export type UploadRunOutcome = { readonly ok: true; readonly result: AnalysisResult } | { readonly ok: false; readonly messages: readonly string[] };

/**
 * Run a prepared upload on `doc` with the picked inputs; every input and the result are validated.
 * A design analysis also needs `design` (the project's Functions and fields): its `uses` is checked
 * first, then the worker receives `buildDesignAnalysisData` and every calculated value.
 */
export async function runUploadedAnalysis(
  prepared: Extract<UploadStatus, { ok: true }>,
  fileName: string,
  doc: GraphSource,
  inputs: readonly unknown[],
  runner: UploadRunner = defaultUploadRunner,
  design?: DesignRunSource,
): Promise<UploadRunOutcome> {
  const { definition, code } = prepared;
  const checked = checkAnalysisInputs(definition.inputs, inputs, doc, definition.id);
  if (!checked.ok) return { ok: false, messages: checked.issues.map((d) => d.message) };
  const context = buildGraphContext(doc, checked.value);
  let designData: { readonly data: DesignAnalysisData; readonly metrics: MetricTable } | undefined;
  if (definition.scope === 'design') {
    if (!design) return { ok: false, messages: ['This design analysis needs an open design.'] };
    const missing = missingUses(definition.uses, design.functions, design.schema);
    if (missing.length > 0) return { ok: false, messages: missing };
    designData = { data: buildDesignAnalysisData(design.doc, design.functions, design.schema, definition.uses), metrics: buildMetricTable(design.doc, design.spatial) };
  }
  const reply = await runner({ op: 'run', code, fileName, graph: context.graph, inputs: context.inputs, ...(designData && { design: designData }) });
  if (!reply.ok) return { ok: false, messages: [reply.message] };
  if (reply.op !== 'run') return { ok: false, messages: ['The analysis sent an unexpected reply.'] };
  const result = validateAnalysisResult(reply.result, doc, definition.id);
  return result.ok ? { ok: true, result: result.value } : { ok: false, messages: result.issues.map((d) => d.message) };
}
