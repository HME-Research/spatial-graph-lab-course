import { z, type core as zcore } from 'zod';
import { formatIssuePath, functionIdSchema } from '@app/document';

/**
 * Runtime validation of student definition objects (the default exports of toolkit files).
 * TypeScript types are erased at runtime and Vite does not type-check in development, so every
 * definition is checked here before it is registered. Unknown fields are rejected (strict
 * objects), so typos and unsupported options are reported instead of silently ignored.
 */

const finite = z.number({ error: 'must be a number' }).refine(Number.isFinite, { error: 'must be a finite number' });

const numberShape = {
  kind: z.literal('number'),
  default: finite.optional(),
  min: finite.optional(),
  max: finite.optional(),
};
const textShape = { kind: z.literal('text'), default: z.string().optional() };
const booleanShape = { kind: z.literal('boolean'), default: z.boolean().optional() };
const enumShape = {
  kind: z.literal('enum'),
  values: z.array(z.string().min(1, { error: 'enum values must not be empty' })).min(1, { error: 'an enum needs at least one value' }),
  default: z.string().optional(),
};

type SpecLike =
  | { kind: 'number'; default?: number | undefined; min?: number | undefined; max?: number | undefined }
  | { kind: 'enum'; values: string[]; default?: string | undefined }
  | { kind: 'text' | 'boolean' };

/** Consistency rules shared by attribute specs and project field specs. */
function refineSpec(spec: SpecLike, ctx: { addIssue(issue: { code: 'custom'; path: string[]; message: string }): void }): void {
  if (spec.kind === 'number') {
    if (spec.min !== undefined && spec.max !== undefined && spec.min > spec.max) {
      ctx.addIssue({ code: 'custom', path: ['min'], message: `min (${spec.min}) is greater than max (${spec.max})` });
    }
    if (spec.default !== undefined && ((spec.min !== undefined && spec.default < spec.min) || (spec.max !== undefined && spec.default > spec.max))) {
      ctx.addIssue({ code: 'custom', path: ['default'], message: `default ${spec.default} is outside min/max` });
    }
  }
  if (spec.kind === 'enum') {
    if (new Set(spec.values).size !== spec.values.length) {
      ctx.addIssue({ code: 'custom', path: ['values'], message: 'enum values must be unique' });
    }
    if (spec.default !== undefined && !spec.values.includes(spec.default)) {
      ctx.addIssue({ code: 'custom', path: ['default'], message: `default "${spec.default}" is not one of the enum values` });
    }
  }
}

const KIND_ERROR = 'attribute kind must be "number", "text", "boolean" or "enum"';

export const attributeSpecSchema = z
  .discriminatedUnion(
    'kind',
    [z.strictObject(numberShape), z.strictObject(textShape), z.strictObject(booleanShape), z.strictObject(enumShape)],
    { error: KIND_ERROR },
  )
  .superRefine((spec, ctx) => refineSpec(spec, ctx));

export const attributeSpecsSchema = z.record(z.string().min(1, { error: 'attribute names must not be empty' }), attributeSpecSchema);

/** A project-wide field spec (`defineToolkit({ custom })`): an attribute spec plus label and help text. */
const fieldText = {
  label: z.string({ error: 'label must be text' }).min(1, { error: 'label must not be empty' }).max(100).optional(),
  description: z.string({ error: 'description must be text' }).max(500).optional(),
};
export const toolkitAttributeSpecSchema = z
  .discriminatedUnion(
    'kind',
    [
      z.strictObject({ ...numberShape, ...fieldText }),
      z.strictObject({ ...textShape, ...fieldText }),
      z.strictObject({ ...booleanShape, ...fieldText }),
      z.strictObject({ ...enumShape, ...fieldText }),
    ],
    { error: KIND_ERROR },
  )
  .superRefine((spec, ctx) => refineSpec(spec, ctx));

/**
 * A transformation parameter (`defineSpatialAlgorithm({ parameters })`, Student API `ParameterSpec`):
 * an attribute spec plus an optional label and description, shown in Transform. Same shape as a
 * toolkit field spec.
 */
export const parameterSpecSchema = toolkitAttributeSpecSchema;
export const parameterSpecsSchema = z.record(z.string().min(1, { error: 'parameter names must not be empty' }), parameterSpecSchema);

const label = z.string({ error: 'label must be text' }).min(1, { error: 'label must not be empty' }).max(100);

const attributeNameSchema = z.string().min(1, { error: 'attribute names must not be empty' });

export const toolkitDefinitionSchema = z.strictObject({
  name: z.string({ error: 'name must be text' }).min(1, { error: 'name must not be empty' }).max(200),
  defaultDesign: z.string().min(1).optional(),
  custom: z
    .strictObject({
      nodes: z.record(attributeNameSchema, toolkitAttributeSpecSchema).optional(),
      edges: z.record(attributeNameSchema, toolkitAttributeSpecSchema).optional(),
    })
    .optional(),
});

/** A function colour: hex `#rrggbb` (either case; the app uses it in lowercase). */
export const HEX_COLOUR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const functionDefinitionSchema = z.strictObject({
  id: functionIdSchema,
  label,
  colour: z.string({ error: 'colour must be text' }).regex(HEX_COLOUR_PATTERN, { error: 'colour must be a hex colour "#rrggbb", e.g. "#e8a33d"' }).optional(),
  facade: z
    .strictObject({
      windowFraction: finite.refine((f) => f >= 0 && f <= 1, { error: 'windowFraction must be between 0 and 1' }),
    })
    .optional(),
  custom: attributeSpecsSchema.optional(),
});

/** Algorithm ids use the same pattern as function ids. */
export const algorithmIdSchema = functionIdSchema;

/** At most this many inputs per analysis (a sanity limit, not a contract field). */
export const MAX_ANALYSIS_INPUTS = 8;

/** Longest optional `description` of a graph analysis (shown by its ⓘ). */
export const MAX_ANALYSIS_DESCRIPTION = 300;

const inputLabel = z.string({ error: 'an input label must be text' }).trim().min(1, { error: 'an input label must not be empty' }).max(40);

/** One declared analysis input (Student API `AnalysisInput`). */
export const analysisInputSchema = z
  .discriminatedUnion(
    'kind',
    [
      z.strictObject({ kind: z.literal('node'), label: inputLabel }),
      z.strictObject({ kind: z.literal('edge'), label: inputLabel }),
      z.strictObject({ kind: z.literal('number'), label: inputLabel, min: finite.optional(), max: finite.optional(), default: finite.optional() }),
    ],
    { error: 'an input kind must be "node", "edge" or "number"' },
  )
  .superRefine((input, ctx) => {
    if (input.kind !== 'number') return;
    refineSpec({ kind: 'number', min: input.min, max: input.max, default: input.default }, ctx);
  });

const run = z.custom<(...args: never[]) => unknown>((v) => typeof v === 'function', { error: 'run must be a function' });

/** The fields every analysis has (graph or design): id, label, optional description and the required inputs. */
const analysisShape = {
  id: algorithmIdSchema,
  label,
  description: z
    .string({ error: 'description must be text' })
    .trim()
    .min(1, { error: 'description must not be empty' })
    .max(MAX_ANALYSIS_DESCRIPTION, { error: `description must be at most ${MAX_ANALYSIS_DESCRIPTION} characters` })
    .optional(),
  inputs: z
    .array(analysisInputSchema, { error: 'inputs must be a list such as [{ kind: "node", label: "Node" }] (use [] for the whole graph)' })
    .max(MAX_ANALYSIS_INPUTS, { error: `an analysis has at most ${MAX_ANALYSIS_INPUTS} inputs` }),
  parameters: z.never({ error: 'analyses take no parameters: ask for a number with an input { kind: "number", label: "…" }' }).optional(),
  run,
};

/** At most this many names in each list of a design analysis's `uses`. */
export const MAX_USES = 50;

const usesList = (what: string, item: z.ZodType<string>) =>
  z.array(item, { error: `uses.${what} must be a list of names` }).max(MAX_USES, { error: `uses.${what} lists at most ${MAX_USES} names` }).optional();

/** A design analysis's `uses` (Student API `AnalysisUses`): what it needs from the project. */
export const analysisUsesSchema = z.strictObject(
  {
    functions: usesList('functions', functionIdSchema),
    nodeFields: usesList('nodeFields', z.string().min(1, { error: 'a field key must not be empty' }).max(100)),
    edgeFields: usesList('edgeFields', z.string().min(1, { error: 'a field key must not be empty' }).max(100)),
  },
  { error: 'uses must be an object such as { functions: ["bedroom"], nodeFields: ["targetArea"] }' },
);

export const algorithmDefinitionSchema = z.discriminatedUnion(
  'scope',
  [
    z.strictObject({ ...analysisShape, scope: z.literal('graph') }),
    z.strictObject({ ...analysisShape, scope: z.literal('design'), uses: analysisUsesSchema.optional() }),
    z.strictObject({
      id: algorithmIdSchema,
      label,
      scope: z.literal('spatial'),
      parameters: parameterSpecsSchema.optional(),
      inputs: z.never({ error: 'inputs are for analyses (defineGraphAlgorithm, defineDesignAnalysis); a transformation uses parameters' }).optional(),
      run,
    }),
  ],
  { error: 'missing scope: create the algorithm with defineGraphAlgorithm, defineDesignAnalysis or defineSpatialAlgorithm' },
);

/** Zod issues as readable one-line messages (path first). */
export function zodMessages(issues: readonly zcore.$ZodIssue[]): string[] {
  return issues.map((i) => {
    const path = i.path.map((p) => (typeof p === 'symbol' ? String(p) : p));
    return path.length === 0 ? i.message : `${formatIssuePath(path)}: ${i.message}`;
  });
}

/** The `id` of a definition-like value if it is a well-formed id, even when the rest is invalid. */
export function readableId(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('id' in value)) return undefined;
  const id = (value as { id: unknown }).id;
  return typeof id === 'string' && functionIdSchema.safeParse(id).success ? id : undefined;
}
