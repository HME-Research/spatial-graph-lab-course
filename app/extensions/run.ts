import { z } from 'zod';
import { type AttributeValue, attributeValueSchema, type DesignDocumentV2 } from '@app/document';
import type { SpatialResolution } from '@app/spatial';
import type { AnalysisInput, AnalysisResult, AttributeSpecs, SpatialAlgorithmContext, SpatialOperation } from '@student-api';
import type { ActiveToolkit } from './activate';
import { checkValue, describeSpec, specFor } from './attributes';
import { buildGraphContext, buildSpatialContextV2, ExtensionRunError, type GraphSource } from './context';
import { EMPTY_ATTRIBUTE_SCHEMA, type ProjectAttributeSchema } from './projectAttributes';
import { zodMessages } from './definitions';
import { diagnostic, fail, ok, type ExtensionDiagnostic, type ExtensionResult } from './diagnostics';
import { applyTransformationV2, type TransformationPreviewV2 } from './transformV2';

/**
 * Runs one algorithm of the active project against a document. The algorithm receives copies
 * only and returns data; this function validates that data (shape, references, operation
 * semantics, final document, conformance) and returns either an analysis or a transformation
 * preview. It never changes application state: applying a preview is the caller's decision.
 */

/** Upper bound on operations in one transformation (a safety limit, not a contract field). */
export const MAX_OPERATIONS = 10_000;

const idList = (what: string) =>
  z.array(z.int({ error: `${what} must contain whole-number ids` }), { error: `${what} must be a list of ids` }).max(100_000);

const analysisSchema = z
  .strictObject({
    kind: z.literal('analysis'),
    value: z.number({ error: 'value must be a number' }).refine(Number.isFinite, { error: 'value must be a finite number' }).optional(),
    text: z.string({ error: 'text must be text' }).max(300, { error: 'text must be at most 300 characters (one short line)' }).optional(),
    highlightNodes: idList('highlightNodes').optional(),
    highlightEdges: idList('highlightEdges').optional(),
    nodeValues: z.record(z.string(), attributeValueSchema, { error: 'nodeValues must be an object of node id → value' }).optional(),
  })
  .refine(
    (r) => r.value !== undefined || r.text !== undefined || r.highlightNodes !== undefined || r.highlightEdges !== undefined || r.nodeValues !== undefined,
    { error: 'an analysis must return at least one of value, text, highlightNodes, highlightEdges or nodeValues' },
  );

/**
 * The picked inputs of a graph analysis, checked against its declared `inputs`: one value per
 * input, node / edge ids that exist in `doc`, numbers within min/max (a missing number takes its
 * default). Readable diagnostics instead of a run.
 */
export function checkAnalysisInputs(
  declared: readonly AnalysisInput[],
  raw: unknown,
  doc: GraphSource,
  algorithmId: string,
): ExtensionResult<readonly number[]> {
  const subject = { kind: 'algorithm', id: algorithmId } as const;
  const given: unknown = raw === undefined ? [] : raw;
  if (!Array.isArray(given)) return fail([diagnostic('invalid-input', 'error', subject, 'inputs must be a list of ids and numbers')]);
  const problems: ExtensionDiagnostic[] = [];
  const out: number[] = [];
  const nodes = new Set(doc.nodes.map((n) => n.id));
  const edges = new Set(doc.edges.map((e) => e.id));
  if (given.length > declared.length) {
    problems.push(diagnostic('invalid-input', 'error', subject, `${given.length} inputs were given, but the analysis takes ${declared.length}`));
  }
  declared.forEach((input, index) => {
    const value: unknown = (given as unknown[])[index] ?? (input.kind === 'number' ? input.default : undefined);
    const fault = (message: string) => {
      problems.push(diagnostic('invalid-input', 'error', subject, `${input.label}: ${message}`, { detail: String(index) }));
    };
    if (input.kind === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) return fault('type a number');
      if (input.min !== undefined && value < input.min) return fault(`must be at least ${input.min}`);
      if (input.max !== undefined && value > input.max) return fault(`must be at most ${input.max}`);
      out.push(value);
      return;
    }
    if (typeof value !== 'number' || !Number.isInteger(value)) return fault(`pick ${input.kind === 'node' ? 'a node' : 'an edge'}`);
    if (!(input.kind === 'node' ? nodes : edges).has(value)) return fault(`there is no ${input.kind} ${value}`);
    out.push(value);
  });
  return problems.length > 0 ? fail(problems) : ok(out);
}

/** Validate a graph analysis's raw result against `doc` (shape, then every id must exist). */
export function validateAnalysisResult(raw: unknown, doc: GraphSource, algorithmId: string): ExtensionResult<AnalysisResult> {
  const subject = { kind: 'algorithm', id: algorithmId } as const;
  const kind = typeof raw === 'object' && raw !== null ? (raw as { kind?: unknown }).kind : undefined;
  if (kind !== 'analysis') return invalidResult(algorithmId, ['graph algorithms must return { kind: "analysis", value, text, highlightNodes, highlightEdges or nodeValues }']);
  const parsed = analysisSchema.safeParse(raw);
  if (!parsed.success) return invalidResult(algorithmId, zodMessages(parsed.error.issues));
  const nodes = new Set(doc.nodes.map((n) => n.id));
  const edges = new Set(doc.edges.map((e) => e.id));
  const problems: ExtensionDiagnostic[] = [];
  const data = parsed.data;
  // nodeValues keys are read from the raw object so that unusual keys (e.g. "__proto__") are not lost.
  const rawValues = (raw as { nodeValues?: object }).nodeValues;
  for (const k of rawValues ? Object.keys(rawValues) : []) {
    if (!(/^(0|[1-9][0-9]*)$/.test(k) && nodes.has(Number(k)))) {
      problems.push(diagnostic('unknown-node-reference', 'error', subject, `nodeValues refers to node ${JSON.stringify(k)}, which does not exist`, { detail: k }));
    }
  }
  for (const id of data.highlightNodes ?? []) {
    if (!nodes.has(id)) problems.push(diagnostic('unknown-node-reference', 'error', subject, `highlightNodes refers to node ${id}, which does not exist`, { detail: `n${id}` }));
  }
  for (const id of data.highlightEdges ?? []) {
    if (!edges.has(id)) problems.push(diagnostic('unknown-edge-reference', 'error', subject, `highlightEdges refers to edge ${id}, which does not exist`, { detail: `e${id}` }));
  }
  if (problems.length > 0) return fail(problems);
  // Zod's output is a fresh copy: later changes by the algorithm to its own objects have no effect.
  return ok({
    kind: 'analysis',
    ...(data.value !== undefined && { value: data.value }),
    ...(data.text !== undefined && { text: data.text }),
    ...(data.highlightNodes !== undefined && { highlightNodes: [...new Set(data.highlightNodes)] }),
    ...(data.highlightEdges !== undefined && { highlightEdges: [...new Set(data.highlightEdges)] }),
    ...(data.nodeValues !== undefined && { nodeValues: data.nodeValues }),
  });
}

const attributesRecord = z.record(z.string().min(1, { error: 'attribute names must not be empty' }), attributeValueSchema);

/** An existing id (a whole number) or the `ref` of an item added earlier in the same run. */
const itemRefSchema = z.union([z.int().min(0), z.string().min(1)], { error: 'must be an id (a whole number) or the ref of a node / edge added earlier' });

const operationSchema = z.discriminatedUnion(
  'op',
  [
    z.strictObject({
      op: z.literal('add-node'),
      ref: z.string().optional(),
      grid: z.tuple([z.number(), z.number(), z.number()], { error: 'grid must be [x, y, z]' }),
      size: z.tuple([z.number(), z.number(), z.number()], { error: 'size must be [sx, sy, sz]' }).optional(),
      typeId: z.string(),
      attributes: attributesRecord.optional(),
    }),
    z.strictObject({ op: z.literal('add-edge'), ref: z.string().optional(), source: itemRefSchema, target: itemRefSchema, kind: z.string() }),
    z.strictObject({ op: z.literal('set-node-attribute'), nodeId: itemRefSchema, key: z.string().min(1), value: attributeValueSchema }),
    z.strictObject({ op: z.literal('set-edge-attribute'), edgeId: itemRefSchema, key: z.string().min(1), value: attributeValueSchema }),
    z.strictObject({
      op: z.literal('set-node-geometry'),
      nodeId: itemRefSchema,
      grid: z.tuple([z.number(), z.number(), z.number()], { error: 'grid must be [x, y, z]' }).optional(),
      size: z.tuple([z.number(), z.number(), z.number()], { error: 'size must be [sx, sy, sz]' }).optional(),
    }),
  ],
  { error: 'op must be "add-node", "add-edge", "set-node-attribute", "set-edge-attribute" or "set-node-geometry"' },
);

const transformationSchema = z.strictObject({
  kind: z.literal('transformation'),
  summary: z.string().max(2000).optional(),
  operations: z.array(operationSchema).max(MAX_OPERATIONS, { error: `at most ${MAX_OPERATIONS} operations are allowed` }),
});

/** Validate parameter values against their specs; missing values take the default. */
export function validateParameters(
  specs: AttributeSpecs,
  raw: unknown,
  algorithmId: string,
): ExtensionResult<Record<string, Exclude<AttributeValue, null>>> {
  const subject = { kind: 'algorithm', id: algorithmId } as const;
  if (raw !== undefined && (typeof raw !== 'object' || raw === null || Array.isArray(raw))) {
    return fail([diagnostic('invalid-parameter', 'error', subject, 'parameters must be an object of name → value')]);
  }
  const values = (raw ?? {}) as Record<string, unknown>;
  const problems: ExtensionDiagnostic[] = [];
  const out: Record<string, Exclude<AttributeValue, null>> = {};
  for (const key of Object.keys(values)) {
    if (!specFor(specs, key)) problems.push(diagnostic('invalid-parameter', 'error', subject, `unknown parameter "${key}"`, { attribute: key }));
  }
  for (const [key, spec] of Object.entries(specs)) {
    const value = Object.prototype.hasOwnProperty.call(values, key) ? values[key] : undefined;
    const status = checkValue(spec, value);
    if (status === 'ok') out[key] = value as Exclude<AttributeValue, null>;
    else if (status === 'invalid') {
      problems.push(diagnostic('invalid-parameter', 'error', subject, `parameter "${key}" must be ${describeSpec(spec)}, not ${JSON.stringify(value)}`, { attribute: key }));
    } else if (spec.default !== undefined) out[key] = spec.default;
  }
  return problems.length > 0 ? fail(problems) : ok(out);
}

function invalidResult(algorithmId: string, messages: readonly string[]): ExtensionResult<never> {
  return fail(
    messages.map((m, n) =>
      diagnostic('invalid-result', 'error', { kind: 'algorithm', id: algorithmId }, `algorithm "${algorithmId}" returned an invalid result: ${m}`, { detail: String(n) }),
    ),
  );
}

/** How one document schema plugs into the shared run pipeline. */
interface RunAdapter<D extends GraphSource, Preview> {
  spatialContext<P extends AttributeSpecs>(
    doc: D,
    project: ActiveToolkit,
    algorithmId: string,
    params: never,
    schema: ProjectAttributeSchema,
    spatial: SpatialResolution | undefined,
  ): SpatialAlgorithmContext<P>;
  apply(doc: D, project: ActiveToolkit, operations: readonly SpatialOperation[], summary: string | undefined, schema: ProjectAttributeSchema): ExtensionResult<Preview>;
}

export interface RunOptions {
  /** The project attribute schema in use (default: the toolkit files' baseline). */
  readonly attributes?: ProjectAttributeSchema;
  /**
   * The host's spatial resolution of the run's (v2) document, with the scenario's face
   * preferences, so `ctx.metrics` matches what the views show. Omitted: `resolveRelationships(doc)`.
   */
  readonly spatial?: SpatialResolution;
  /** The picked inputs of a graph analysis, in declaration order (checked by `checkAnalysisInputs`). */
  readonly inputs?: readonly unknown[];
}

function runWith<D extends GraphSource, Preview>(
  adapter: RunAdapter<D, Preview>,
  doc: D,
  project: ActiveToolkit,
  algorithmId: string,
  params: unknown,
  options: RunOptions = {},
): ExtensionResult<{ readonly kind: 'analysis'; readonly result: AnalysisResult } | { readonly kind: 'transformation'; readonly preview: Preview }> {
  const schema = options.attributes ?? project.attributeBaseline?.schema ?? EMPTY_ATTRIBUTE_SCHEMA;
  const subject = { kind: 'algorithm', id: algorithmId } as const;
  const entry = project.algorithms.find((a) => a.id === algorithmId);
  if (!entry) return fail([diagnostic('unknown-algorithm', 'error', subject, `project "${project.id}" has no algorithm "${algorithmId}"`)]);
  if (!entry.status.ok) {
    return fail([diagnostic('algorithm-disabled', 'error', subject, `algorithm "${algorithmId}" (${entry.file}) is invalid and disabled`)]);
  }
  const algorithm = entry.definition;
  const failed = (error: unknown) => {
    if (error instanceof ExtensionRunError) return fail([error.diagnostic]);
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return fail([diagnostic('run-failed', 'error', subject, `algorithm "${algorithmId}" failed: ${detail}`)]);
  };

  if (algorithm.scope === 'graph') {
    // Graph analyses take inputs, never parameters.
    if (params !== undefined && (typeof params !== 'object' || params === null || Object.keys(params).length > 0)) {
      return fail([diagnostic('invalid-parameter', 'error', subject, 'graph analyses take no parameters (they declare inputs)')]);
    }
    const inputs = checkAnalysisInputs(algorithm.inputs, options.inputs, doc, algorithmId);
    if (!inputs.ok) return inputs;
    let raw: unknown;
    try {
      raw = algorithm.run(buildGraphContext(doc, inputs.value));
    } catch (error) {
      return failed(error);
    }
    const result = validateAnalysisResult(raw, doc, algorithmId);
    return result.ok ? ok({ kind: 'analysis', result: result.value }) : result;
  }

  const parameters = validateParameters(algorithm.parameters ?? {}, params, algorithmId);
  if (!parameters.ok) return parameters;
  let raw: unknown;
  try {
    raw = algorithm.run(adapter.spatialContext(doc, project, algorithmId, parameters.value as never, schema, options.spatial));
  } catch (error) {
    return failed(error);
  }

  const kind = typeof raw === 'object' && raw !== null ? (raw as { kind?: unknown }).kind : undefined;
  if (kind !== 'transformation') return invalidResult(algorithmId, ['spatial algorithms must return { kind: "transformation", operations }']);
  const parsed = transformationSchema.safeParse(raw);
  if (!parsed.success) return invalidResult(algorithmId, zodMessages(parsed.error.issues));
  // Zod's output is a fresh copy: later changes by the algorithm to its own objects have no effect.
  const operations = parsed.data.operations as readonly SpatialOperation[];
  const preview = adapter.apply(doc, project, operations, parsed.data.summary, schema);
  return preview.ok ? ok({ kind: 'transformation', preview: preview.value }) : preview;
}

const V2_ADAPTER: RunAdapter<DesignDocumentV2, TransformationPreviewV2> = {
  spatialContext: (doc, project, id, params, schema, spatial) => buildSpatialContextV2(doc, project, id, params, schema, spatial),
  apply: (doc, project, operations, summary, schema) => applyTransformationV2(doc, project, operations, summary, schema),
};

export type RunOutcomeV2 =
  | { readonly kind: 'analysis'; readonly result: AnalysisResult }
  | { readonly kind: 'transformation'; readonly preview: TransformationPreviewV2 };

/**
 * Run an algorithm against a VALIDATED schema-v2 document. Same validation pipeline; the
 * transformation preview's `after` is a validated v2 document (`validateDocumentV2`), and
 * `displacedRoutes` must be confirmed by the user before it is applied.
 */
export function runAlgorithmV2(
  doc: DesignDocumentV2,
  project: ActiveToolkit,
  algorithmId: string,
  params?: unknown,
  options: RunOptions = {},
): ExtensionResult<RunOutcomeV2> {
  return runWith(V2_ADAPTER, doc, project, algorithmId, params, options);
}
