import { z, type core as zcore } from 'zod';
import { formatIssuePath, typeIdSchema } from '@app/document';

/**
 * Runtime validation of student definition objects (the default exports of project files).
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

/** A project-wide field spec (`defineProject({ attributes })`): an attribute spec plus label and help text. */
const fieldText = {
  label: z.string({ error: 'label must be text' }).min(1, { error: 'label must not be empty' }).max(100).optional(),
  description: z.string({ error: 'description must be text' }).max(500).optional(),
};
export const projectAttributeSpecSchema = z
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

const label = z.string({ error: 'label must be text' }).min(1, { error: 'label must not be empty' }).max(100);

const attributeNameSchema = z.string().min(1, { error: 'attribute names must not be empty' });

export const projectDefinitionSchema = z.strictObject({
  name: z.string({ error: 'name must be text' }).min(1, { error: 'name must not be empty' }).max(200),
  defaultDesign: z.string().min(1).optional(),
  attributes: z
    .strictObject({
      nodes: z.record(attributeNameSchema, projectAttributeSpecSchema).optional(),
      edges: z.record(attributeNameSchema, projectAttributeSpecSchema).optional(),
    })
    .optional(),
});

export const nodeTypeDefinitionSchema = z.strictObject({
  id: typeIdSchema,
  label,
  facade: z
    .strictObject({
      windowFraction: finite.refine((f) => f >= 0 && f <= 1, { error: 'windowFraction must be between 0 and 1' }),
    })
    .optional(),
  attributes: attributeSpecsSchema.optional(),
});

/** Algorithm ids use the same pattern as node type ids. */
export const algorithmIdSchema = typeIdSchema;

export const algorithmDefinitionSchema = z.strictObject({
  id: algorithmIdSchema,
  label,
  parameters: attributeSpecsSchema.optional(),
  scope: z.enum(['graph', 'spatial'], {
    error: 'missing scope: create the algorithm with defineGraphAlgorithm or defineSpatialAlgorithm',
  }),
  run: z.custom<(...args: never[]) => unknown>((v) => typeof v === 'function', { error: 'run must be a function' }),
});

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
  return typeof id === 'string' && typeIdSchema.safeParse(id).success ? id : undefined;
}
