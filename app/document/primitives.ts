import type { GridCoord } from '@core/spatial';
import { z } from 'zod';

export type { GridCoord } from '@core/spatial';

/**
 * Shared building blocks of the design document schema (docs/CONTRACTS-V2.md): ids, Function ids,
 * grid cells, attribute values, diagram positions and metadata. The document itself is in
 * `v2/schema.ts`.
 *
 * Coordinate conventions:
 * - `grid` is a spatial cell address [x, y, z] of integers. **z is up**: z is the storey axis,
 *   x/y are horizontal. Renderers map this to their own axes; the document never changes.
 * - `diagram.positions` are independent 2D diagram coordinates. They are NOT derived from
 *   `grid`, and changing one never changes the other.
 */

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const TYPE_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export const idSchema = z
  .string()
  .min(1, { error: 'ID must not be empty' })
  .max(64, { error: 'ID must be at most 64 characters' })
  .regex(ID_PATTERN, {
    error: 'ID must start with a letter or digit and use only letters, digits, "_", "." or "-"',
  });

export const typeIdSchema = z.string().regex(TYPE_ID_PATTERN, {
  error: 'typeId must be lowercase letters, digits and "-", starting with a letter (e.g. "gallery")',
});

const gridIntSchema = z.int({ error: 'grid coordinates must be integers' });

export const gridSchema = z.tuple([gridIntSchema, gridIntSchema, gridIntSchema], {
  error: 'grid must be an array of three integers [x, y, z]',
});

/** Attribute values are JSON primitives only. */
export const attributeValueSchema = z.union(
  [z.string(), z.number().refine(Number.isFinite, { error: 'numbers must be finite' }), z.boolean(), z.null()],
  { error: 'attribute values must be a string, number, boolean or null' },
);

/**
 * Attribute maps. A key literally named "__proto__" cannot be stored safely in a JavaScript object
 * and Zod would drop it silently, so it is refused with an explicit message instead (programme
 * phase 09): an import never loses a value without saying so.
 */
export const attributesSchema = z
  .custom<unknown>((v) => !(typeof v === 'object' && v !== null && Object.prototype.hasOwnProperty.call(v, '__proto__')), {
    error: 'the attribute name "__proto__" is not allowed (it cannot be stored safely); rename it',
  })
  .pipe(
    z.record(
      z.string().min(1, { error: 'attribute names must not be empty' }),
      attributeValueSchema,
    ),
  );

const finiteNumber = z.number().refine(Number.isFinite, { error: 'diagram coordinates must be finite' });

export const diagramPositionSchema = z.tuple([finiteNumber, finiteNumber], {
  error: 'diagram position must be an array of two numbers [x, y]',
});

export const diagramSchema = z.strictObject({
  positions: z.record(z.string(), diagramPositionSchema).default({}),
});

export const metadataSchema = z.strictObject({
  name: z.string().min(1, { error: 'metadata.name must not be empty' }).max(200),
  description: z.string().max(2000).optional(),
});

/** Compile-time guard: the schema's grid tuple must stay identical to core/spatial's GridCoord. */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const gridCoordMatchesCore: Equals<z.infer<typeof gridSchema>, GridCoord> = true;
void gridCoordMatchesCore;

export type DiagramPosition = z.infer<typeof diagramPositionSchema>;
export type AttributeValue = z.infer<typeof attributeValueSchema>;
export type Attributes = z.infer<typeof attributesSchema>;
