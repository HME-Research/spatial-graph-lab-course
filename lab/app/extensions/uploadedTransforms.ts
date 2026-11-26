import { footprintCells, roomContact, SPATIAL_GRAPH_POLICY, type DesignDocumentV2, type RoomNode } from '@app/document';
import type { SpatialResolution } from '@app/spatial';
import type { ParameterSpecs, SpatialEdge, SpatialNode } from '@student-api';
import type { ActiveToolkit } from './activate';
import { buildMetricTable, projectCustomFields } from './context';
import { algorithmDefinitionSchema, zodMessages } from './definitions';
import { diagnostic, fail, ok, type ExtensionResult } from './diagnostics';
import { EMPTY_ATTRIBUTE_SCHEMA, type ProjectAttributeSchema } from './projectAttributes';
import { effectiveEdgeValues, effectiveNodeValues } from './resolveAttributes';
import { checkTransformationResult, validateParameters, type RunOutcomeV2 } from './run';
import type { TransformRunData } from './transformContext';
import { applyTransformationV2 } from './transformV2';
import type { ToolkitModules } from './uploadSandbox';
import { browserWorker, UPLOAD_TIMEOUT_MS, workerRunner, type UploadRunner } from './uploadedAnalyses';
import { ANALYSIS_REFUSAL, compileUpload } from './uploadSource';

/**
 * Uploaded transforms (owner 2026-11-25): a student's own `.ts` transform (one file that
 * default-exports `defineSpatialAlgorithm({ … })`), uploaded in Transform, stored as SOURCE TEXT in
 * the project file (`settings.uploadedTransforms`) and compiled again whenever the project opens.
 * The same file works in `toolkits/<id>/algorithms/` (as long as it does not use `customOf`).
 *
 * Pipeline, sharing the analysis upload engine: `compileUpload` → a Web Worker evaluates it
 * (`op: 'load'`, `surface: 'transform'`) → its plain data is validated with the SAME schema as a
 * toolkit transform (`algorithmDefinitionSchema`, scope `spatial`). Each run: parameters checked
 * (`validateParameters`) → a fresh worker runs it on plain data only (`buildTransformRunData`;
 * never the document), stopped after `UPLOAD_TIMEOUT_MS` → the result is checked exactly like a
 * toolkit transform (`checkTransformationResult`, then `applyTransformationV2` against the panel's
 * project registry), giving the same preview type. Nothing changes until the student Applies it.
 */

/** The validated definition of an uploaded transform (plain data; `run` stays in the worker). */
export interface UploadedTransformDefinition {
  readonly id: string;
  readonly label: string;
  /** Its parameters (each with an optional label and description), as for a toolkit transform. */
  readonly parameters: ParameterSpecs;
}

export type TransformUploadStatus =
  /** `modules` / `functionFiles`: for a transform of an uploaded toolkit, every compiled module and its Function files. */
  | { readonly ok: true; readonly definition: UploadedTransformDefinition; readonly code: string; readonly modules?: ToolkitModules; readonly functionFiles?: readonly string[] }
  | { readonly ok: false; readonly problems: readonly string[] };

let sharedRunner: UploadRunner | undefined;
/** The app's runner for transforms (real Web Workers), created on first use. */
export const defaultTransformRunner: UploadRunner = (request) => (sharedRunner ??= workerRunner(browserWorker, UPLOAD_TIMEOUT_MS, 'transform'))(request);

/**
 * Compile, load in a worker and validate an uploaded transform: the same definition rules as a
 * toolkit transform (strict fields, id pattern, label, parameter specs). An analysis is refused
 * here with a message pointing to Analyse.
 */
export async function prepareTransformUpload(source: string, fileName: string, runner: UploadRunner = defaultTransformRunner): Promise<TransformUploadStatus> {
  const compiled = await compileUpload(source, fileName, 'transform');
  if (!compiled.ok) return compiled;
  const reply = await runner({ op: 'load', code: compiled.code, fileName, surface: 'transform' });
  if (!reply.ok) return { ok: false, problems: [reply.message] };
  if (reply.op !== 'load') return { ok: false, problems: ['The transform sent an unexpected reply.'] };
  if (reply.definition.scope !== 'spatial') return { ok: false, problems: [ANALYSIS_REFUSAL] };
  // `run` was checked in the worker; validate everything else exactly as for a toolkit transform.
  const parsed = algorithmDefinitionSchema.safeParse({ ...reply.definition, run: () => undefined });
  if (!parsed.success) return { ok: false, problems: zodMessages(parsed.error.issues) };
  if (parsed.data.scope !== 'spatial') return { ok: false, problems: [ANALYSIS_REFUSAL] };
  return { ok: true, code: compiled.code, definition: { id: parsed.data.id, label: parsed.data.label, parameters: (parsed.data.parameters ?? {}) as ParameterSpecs } };
}

const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
const FACE_STEPS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;

/**
 * Everything an uploaded transform may read, as plain data for the worker, with the answers of
 * the toolkit context (`buildSpatialContextV2`) precomputed on `doc`: deep copies of the rooms and
 * relationships, the project's custom fields, the effective custom values of every node and edge
 * (the same resolver), every occupied cell, every touching pair (`roomContact !== null`), every
 * related pair and every calculated value (`buildMetricTable`, with the host's resolution when given).
 */
export function buildTransformRunData(doc: DesignDocumentV2, schema: ProjectAttributeSchema, spatial?: SpatialResolution): TransformRunData {
  const occupied: (readonly [number, number, number, number])[] = [];
  const occupant = new Map<string, number>();
  for (const n of doc.nodes) {
    for (const [x, y, z] of footprintCells(n)) {
      occupied.push([x, y, z, n.id]);
      occupant.set(cellKey(x, y, z), n.id);
    }
  }
  // Rooms that share a face have neighbouring cells; each candidate is confirmed by the app's own rule.
  const rooms = new Map<number, RoomNode>(doc.nodes.map((n) => [n.id, n] as const));
  const touching = new Map<string, readonly [number, number]>();
  for (const n of doc.nodes) {
    for (const [x, y, z] of footprintCells(n)) {
      for (const [dx, dy, dz] of FACE_STEPS) {
        const other = occupant.get(cellKey(x + dx, y + dy, z + dz));
        if (other === undefined || other === n.id) continue;
        const pair = n.id < other ? ([n.id, other] as const) : ([other, n.id] as const);
        const key = `${pair[0]}:${pair[1]}`;
        if (!touching.has(key) && roomContact(rooms.get(pair[0])!, rooms.get(pair[1])!) !== null) touching.set(key, pair);
      }
    }
  }
  const related = new Map<string, readonly [number, number]>();
  for (const e of doc.edges) {
    const pair = e.source < e.target ? ([e.source, e.target] as const) : ([e.target, e.source] as const);
    related.set(`${pair[0]}:${pair[1]}`, pair);
  }
  const byPair = (a: readonly [number, number], b: readonly [number, number]) => a[0] - b[0] || a[1] - b[1];
  return {
    design: {
      policy: { ...SPATIAL_GRAPH_POLICY },
      nodes: structuredClone(doc.nodes) as unknown as SpatialNode[],
      edges: structuredClone(doc.edges) as unknown as SpatialEdge[],
    },
    customFields: projectCustomFields(schema),
    nodeCustom: doc.nodes.map((n) => [n.id, effectiveNodeValues(schema, n)] as const),
    edgeCustom: doc.edges.map((e) => [e.id, effectiveEdgeValues(schema, e)] as const),
    occupied,
    touching: [...touching.values()].sort(byPair),
    related: [...related.values()].sort(byPair),
    metrics: buildMetricTable(doc, spatial),
  };
}

export interface UploadedTransformRunOptions {
  /** The project attribute schema in use (default: the toolkit files' baseline). */
  readonly attributes?: ProjectAttributeSchema;
  /** The host's resolution of `doc` (with the scenario's face preferences), for `ctx.metrics`. */
  readonly spatial?: SpatialResolution;
  /** An uploaded toolkit's `ctx.customOf` answers (`TransformRunData.customOf`). */
  readonly customOf?: TransformRunData['customOf'];
}

/**
 * Run a prepared transform on `doc` with the parameter values `params` (unchecked: validated here
 * with `validateParameters`, defaults applied). The result is validated and applied to a private
 * draft exactly like a toolkit transform's (`project` is the open project's registry: a toolkit
 * with the project's own Functions, or a project without a toolkit), giving the same outcome type
 * as `runAlgorithmV2`. Never throws; never changes `doc`.
 */
export async function runUploadedTransform(
  prepared: Extract<TransformUploadStatus, { ok: true }>,
  fileName: string,
  doc: DesignDocumentV2,
  project: ActiveToolkit,
  params: unknown,
  options: UploadedTransformRunOptions = {},
  runner: UploadRunner = defaultTransformRunner,
): Promise<ExtensionResult<RunOutcomeV2>> {
  const { definition, code } = prepared;
  const subject = { kind: 'algorithm', id: definition.id } as const;
  const schema = options.attributes ?? project.attributeBaseline?.schema ?? EMPTY_ATTRIBUTE_SCHEMA;
  const parameters = validateParameters(definition.parameters, params, definition.id);
  if (!parameters.ok) return parameters;
  let data: TransformRunData;
  try {
    data = buildTransformRunData(doc, schema, options.spatial);
    if (options.customOf) data = { ...data, customOf: options.customOf };
  } catch (error) {
    return fail([diagnostic('run-failed', 'error', subject, `The design could not be prepared for "${definition.label}": ${error instanceof Error ? error.message : String(error)}`)]);
  }
  const reply = await runner({
    op: 'transform',
    code,
    fileName,
    data,
    params: parameters.value,
    ...(prepared.modules && { modules: prepared.modules, functionFiles: prepared.functionFiles ?? [] }),
  });
  if (!reply.ok) return fail([diagnostic('run-failed', 'error', subject, reply.message)]);
  if (reply.op !== 'run') return fail([diagnostic('run-failed', 'error', subject, 'The transform sent an unexpected reply.')]);
  const checked = checkTransformationResult(reply.result, definition.id);
  if (!checked.ok) return checked;
  const preview = applyTransformationV2(doc, project, checked.value.operations, checked.value.summary, schema);
  return preview.ok ? ok({ kind: 'transformation', preview: preview.value }) : preview;
}
