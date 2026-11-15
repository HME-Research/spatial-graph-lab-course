import { z } from 'zod';
import { attributeValueSchema, type AttributeValue, type DesignDocument } from '@app/document';
import type { DesignDocumentV2 } from '@app/document/v2';
import type { AnalysisResult, AttributeSpecs, SpatialAlgorithmContext, SpatialOperation } from '@student-api';
import type { ActiveProject } from './activate';
import { checkValue, describeSpec, specFor } from './attributes';
import { buildGraphContext, buildSpatialContext, buildSpatialContextV2, ExtensionRunError, type GraphSource } from './context';
import { zodMessages } from './definitions';
import { diagnostic, fail, ok, type ExtensionDiagnostic, type ExtensionResult } from './diagnostics';
import { applyTransformation, type TransformationPreview } from './transform';
import { applyTransformationV2, type TransformationPreviewV2 } from './transformV2';

/**
 * Runs one algorithm of the active project against a document. The algorithm receives copies
 * only and returns data; this function validates that data (shape, references, operation
 * semantics, final document, conformance) and returns either an analysis or a transformation
 * preview. It never changes application state: applying a preview is the caller's decision.
 */

export type RunOutcome =
  | { readonly kind: 'analysis'; readonly result: AnalysisResult }
  | { readonly kind: 'transformation'; readonly preview: TransformationPreview };

/** Upper bound on operations in one transformation (a safety limit, not a contract field). */
export const MAX_OPERATIONS = 10_000;

const analysisSchema = z.strictObject({
  kind: z.literal('analysis'),
  summary: z.string().max(2000).optional(),
  nodeValues: z.record(z.string(), attributeValueSchema),
});

const attributesRecord = z.record(z.string().min(1, { error: 'attribute names must not be empty' }), attributeValueSchema);

const operationSchema = z.discriminatedUnion(
  'op',
  [
    z.strictObject({
      op: z.literal('add-node'),
      id: z.string(),
      grid: z.tuple([z.number(), z.number(), z.number()], { error: 'grid must be [x, y, z]' }),
      size: z.tuple([z.number(), z.number(), z.number()], { error: 'size must be [sx, sy, sz]' }).optional(),
      typeId: z.string(),
      attributes: attributesRecord.optional(),
    }),
    z.strictObject({ op: z.literal('add-edge'), id: z.string(), source: z.string(), target: z.string(), kind: z.string() }),
    z.strictObject({ op: z.literal('set-node-attribute'), nodeId: z.string(), key: z.string().min(1), value: attributeValueSchema }),
  ],
  { error: 'op must be "add-node", "add-edge" or "set-node-attribute"' },
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
  spatialContext<P extends AttributeSpecs>(doc: D, project: ActiveProject, algorithmId: string, params: never): SpatialAlgorithmContext<P>;
  apply(doc: D, project: ActiveProject, operations: readonly SpatialOperation[], summary?: string): ExtensionResult<Preview>;
}

function runWith<D extends GraphSource, Preview>(
  adapter: RunAdapter<D, Preview>,
  doc: D,
  project: ActiveProject,
  algorithmId: string,
  params: unknown,
): ExtensionResult<{ readonly kind: 'analysis'; readonly result: AnalysisResult } | { readonly kind: 'transformation'; readonly preview: Preview }> {
  const subject = { kind: 'algorithm', id: algorithmId } as const;
  const entry = project.algorithms.find((a) => a.id === algorithmId);
  if (!entry) return fail([diagnostic('unknown-algorithm', 'error', subject, `project "${project.id}" has no algorithm "${algorithmId}"`)]);
  if (!entry.status.ok) {
    return fail([diagnostic('algorithm-disabled', 'error', subject, `algorithm "${algorithmId}" (${entry.file}) is invalid and disabled`)]);
  }
  const algorithm = entry.definition;
  const parameters = validateParameters(algorithm.parameters ?? {}, params, algorithmId);
  if (!parameters.ok) return parameters;

  let raw: unknown;
  try {
    raw =
      algorithm.scope === 'graph'
        ? algorithm.run(buildGraphContext(doc, parameters.value))
        : algorithm.run(adapter.spatialContext(doc, project, algorithmId, parameters.value as never));
  } catch (error) {
    if (error instanceof ExtensionRunError) return fail([error.diagnostic]);
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return fail([diagnostic('run-failed', 'error', subject, `algorithm "${algorithmId}" failed: ${detail}`)]);
  }

  const kind = typeof raw === 'object' && raw !== null ? (raw as { kind?: unknown }).kind : undefined;
  if (algorithm.scope === 'graph') {
    if (kind !== 'analysis') return invalidResult(algorithmId, ['graph algorithms must return { kind: "analysis", nodeValues }']);
    const parsed = analysisSchema.safeParse(raw);
    if (!parsed.success) return invalidResult(algorithmId, zodMessages(parsed.error.issues));
    const known = new Set(doc.nodes.map((n) => n.id));
    // Keys are read from the raw object so that unusual keys (e.g. "__proto__") are not lost.
    const unknown = Object.keys((raw as { nodeValues: object }).nodeValues).filter((k) => !known.has(k));
    if (unknown.length > 0) {
      return fail(
        unknown.map((k) => diagnostic('unknown-node-reference', 'error', subject, `nodeValues refers to node "${k}", which does not exist`, { detail: k })),
      );
    }
    const result: AnalysisResult = {
      kind: 'analysis',
      nodeValues: parsed.data.nodeValues,
      ...(parsed.data.summary !== undefined && { summary: parsed.data.summary }),
    };
    return ok({ kind: 'analysis', result });
  }

  if (kind !== 'transformation') return invalidResult(algorithmId, ['spatial algorithms must return { kind: "transformation", operations }']);
  const parsed = transformationSchema.safeParse(raw);
  if (!parsed.success) return invalidResult(algorithmId, zodMessages(parsed.error.issues));
  // Zod's output is a fresh copy: later changes by the algorithm to its own objects have no effect.
  const operations = parsed.data.operations as readonly SpatialOperation[];
  const preview = adapter.apply(doc, project, operations, parsed.data.summary);
  return preview.ok ? ok({ kind: 'transformation', preview: preview.value }) : preview;
}

const V1_ADAPTER: RunAdapter<DesignDocument, TransformationPreview> = {
  spatialContext: (doc, project, id, params) => buildSpatialContext(doc, project, id, params),
  apply: applyTransformation,
};

const V2_ADAPTER: RunAdapter<DesignDocumentV2, TransformationPreviewV2> = {
  spatialContext: (doc, project, id, params) => buildSpatialContextV2(doc, project, id, params),
  apply: applyTransformationV2,
};

/** Run an algorithm against the schema-v1 document (today's app; see `runAlgorithmV2`). */
export function runAlgorithm(doc: DesignDocument, project: ActiveProject, algorithmId: string, params?: unknown): ExtensionResult<RunOutcome> {
  return runWith(V1_ADAPTER, doc, project, algorithmId, params);
}

export type RunOutcomeV2 =
  | { readonly kind: 'analysis'; readonly result: AnalysisResult }
  | { readonly kind: 'transformation'; readonly preview: TransformationPreviewV2 };

/**
 * Run an algorithm against a VALIDATED schema-v2 document. Same validation pipeline; the
 * transformation preview's `after` is a validated v2 document (`validateDocumentV2`), and
 * `displacedRoutes` must be confirmed by the user before it is applied.
 */
export function runAlgorithmV2(doc: DesignDocumentV2, project: ActiveProject, algorithmId: string, params?: unknown): ExtensionResult<RunOutcomeV2> {
  return runWith(V2_ADAPTER, doc, project, algorithmId, params);
}
