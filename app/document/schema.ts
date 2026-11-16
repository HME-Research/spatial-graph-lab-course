import type { GridCoord } from '@core/spatial';
import { z } from 'zod';
import { EDGE_KINDS, SCHEMA_VERSION } from './constants';

export type { GridCoord } from '@core/spatial';

/**
 * Design document schema v1 (structure only; graph invariants live in validate.ts).
 *
 * Coordinate conventions:
 * - `grid` is a spatial cell address [x, y, z] of integers. **z is up**: z is the storey axis,
 *   x/y are horizontal. Renderers map this to their own axes; the document never changes.
 * - `diagram.positions` are independent 2D diagram coordinates. They are NOT derived from
 *   `grid`, and changing one never changes the other.
 *
 * Adjacent cells are NOT implicitly connected: only explicit edges are relationships.
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

export const edgeKindSchema = z.enum(EDGE_KINDS, {
  error: `edge kind must be one of: ${EDGE_KINDS.join(', ')}`,
});

export const nodeSchema = z.strictObject({
  id: idSchema,
  grid: gridSchema,
  typeId: typeIdSchema,
  attributes: attributesSchema.default({}),
});

export const edgeSchema = z.strictObject({
  id: idSchema,
  source: idSchema,
  target: idSchema,
  kind: edgeKindSchema,
  attributes: attributesSchema.default({}),
});

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

export const designDocumentSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  metadata: metadataSchema,
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
  diagram: diagramSchema.default({ positions: {} }),
});

/** Compile-time guard: the schema's grid tuple must stay identical to core/spatial's GridCoord. */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const gridCoordMatchesCore: Equals<z.infer<typeof gridSchema>, GridCoord> = true;
void gridCoordMatchesCore;

export type DiagramPosition = z.infer<typeof diagramPositionSchema>;
export type AttributeValue = z.infer<typeof attributeValueSchema>;
export type Attributes = z.infer<typeof attributesSchema>;
export type GraphNode = z.infer<typeof nodeSchema>;
export type GraphEdge = z.infer<typeof edgeSchema>;
export type DesignDocument = z.infer<typeof designDocumentSchema>;
