import { z, type core as zcore } from 'zod';
import { formatIssuePath, typeIdSchema } from '@app/document';

/**
 * Runtime validation of student definition objects (the default exports of project files).
 * TypeScript types are erased at runtime and Vite does not type-check in development, so every
 * definition is checked here before it is registered. Unknown fields are rejected (strict
 * objects), so typos and unsupported options are reported instead of silently ignored.
 */

const finite = z.number({ error: 'must be a number' }).refine(Number.isFinite, { error: 'must be a finite number' });

const numberSpec = z.strictObject({
  kind: z.literal('number'),
  default: finite.optional(),
  min: finite.optional(),
  max: finite.optional(),
});
const textSpec = z.strictObject({ kind: z.literal('text'), default: z.string().optional() });
const booleanSpec = z.strictObject({ kind: z.literal('boolean'), default: z.boolean().optional() });
const enumSpec = z.strictObject({
  kind: z.literal('enum'),
  values: z.array(z.string().min(1, { error: 'enum values must not be empty' })).min(1, { error: 'an enum needs at least one value' }),
  default: z.string().optional(),
});

export const attributeSpecSchema = z
  .discriminatedUnion('kind', [numberSpec, textSpec, booleanSpec, enumSpec], {
    error: 'attribute kind must be "number", "text", "boolean" or "enum"',
  })
  .superRefine((spec, ctx) => {
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
  });

export const attributeSpecsSchema = z.record(z.string().min(1, { error: 'attribute names must not be empty' }), attributeSpecSchema);

const label = z.string({ error: 'label must be text' }).min(1, { error: 'label must not be empty' }).max(100);

export const projectDefinitionSchema = z.strictObject({
  name: z.string({ error: 'name must be text' }).min(1, { error: 'name must not be empty' }).max(200),
  defaultDesign: z.string().min(1).optional(),
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
