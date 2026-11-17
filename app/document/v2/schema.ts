import { z } from 'zod';
import {
  attributesSchema,
  diagramSchema,
  gridSchema,
  idSchema,
  metadataSchema,
  typeIdSchema,
} from '../schema';
import {
  CONNECTOR_STYLES,
  DEFAULT_ROOM_SIZE,
  MAX_ROOM_SIZE,
  RELATIONSHIP_KINDS,
  ROOF_STYLES,
  WINDOW_LAYOUTS,
  SCHEMA_VERSION_V2,
} from './constants';

/**
 * Design document schema v2 — FROZEN Gate 0 contract (structure only; graph and footprint
 * invariants live in validate.ts). See docs/CONTRACTS-V2.md.
 *
 * - Node `id` is the permanent identity (unchanged from v1). `displayId` is a short, optional,
 *   user-facing label (e.g. "01"), stored independently and never derived from array order at
 *   render time.
 * - `grid` is the room's MINIMUM corner cell [x, y, z] (z up); `size` is [sx, sy, sz], positive
 *   integers. The room occupies every cell grid + [0..sx-1, 0..sy-1, 0..sz-1].
 * - Edge `kind` is relationship intent (`access` | `open`), independent of adjacency.
 * - `connectorStyle` is optional; `undefined` means DEFAULT_CONNECTOR_STYLE (resolved on read).
 * - `settings.typeAppearance` holds per-design, per-node-type overrides; omitted fields inherit
 *   the project default (resolved on read, never materialised).
 * - `diagram.positions` stay independent 2D diagram coordinates.
 */

const DISPLAY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,11}$/;

export const displayIdSchema = z.string().regex(DISPLAY_ID_PATTERN, {
  error: 'displayId must be 1–12 letters, digits, "_", "." or "-", starting with a letter or digit (e.g. "01")',
});

const sizeIntSchema = z
  .int({ error: 'size components must be integers' })
  .min(1, { error: 'size components must be at least 1' })
  .max(MAX_ROOM_SIZE, { error: `size components must be at most ${MAX_ROOM_SIZE}` });

export const sizeSchema = z.tuple([sizeIntSchema, sizeIntSchema, sizeIntSchema], {
  error: 'size must be an array of three positive integers [sx, sy, sz]',
});

export const relationshipKindSchema = z.enum(RELATIONSHIP_KINDS, {
  error: `edge kind must be one of: ${RELATIONSHIP_KINDS.join(', ')}`,
});

export const connectorStyleSchema = z.enum(CONNECTOR_STYLES, {
  error: `connectorStyle must be one of: ${CONNECTOR_STYLES.join(', ')}`,
});

export const windowLayoutSchema = z.enum(WINDOW_LAYOUTS, { error: `windowLayout must be one of: ${WINDOW_LAYOUTS.join(', ')}` });

export const roofStyleSchema = z.enum(ROOF_STYLES, { error: `roof must be one of: ${ROOF_STYLES.join(', ')}` });

export const windowFractionSchema = z
  .number({ error: 'windowFraction must be a number' })
  .refine(Number.isFinite, { error: 'windowFraction must be finite' })
  .min(0, { error: 'windowFraction must be between 0 and 1' })
  .max(1, { error: 'windowFraction must be between 0 and 1' });

export const roomNodeSchema = z.strictObject({
  id: idSchema,
  displayId: displayIdSchema.optional(),
  grid: gridSchema,
  size: sizeSchema.default([...DEFAULT_ROOM_SIZE]),
  typeId: typeIdSchema,
  attributes: attributesSchema.default({}),
});

export const relationshipEdgeSchema = z.strictObject({
  id: idSchema,
  source: idSchema,
  target: idSchema,
  kind: relationshipKindSchema,
  connectorStyle: connectorStyleSchema.optional(),
  attributes: attributesSchema.default({}),
});

export const typeAppearanceSchema = z.strictObject({
  windowFraction: windowFractionSchema.optional(),
  windowLayout: windowLayoutSchema.optional(),
  roof: roofStyleSchema.optional(),
});

export const designSettingsSchema = z.strictObject({
  typeAppearance: z.record(typeIdSchema, typeAppearanceSchema).default({}),
});

export const designDocumentV2Schema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION_V2),
  metadata: metadataSchema,
  nodes: z.array(roomNodeSchema),
  edges: z.array(relationshipEdgeSchema),
  diagram: diagramSchema.default({ positions: {} }),
  settings: designSettingsSchema.default({ typeAppearance: {} }),
});

export type RoomSize = z.infer<typeof sizeSchema>;
export type RoomNode = z.infer<typeof roomNodeSchema>;
export type RelationshipEdge = z.infer<typeof relationshipEdgeSchema>;
export type TypeAppearance = z.infer<typeof typeAppearanceSchema>;
export type DesignSettings = z.infer<typeof designSettingsSchema>;
export type DesignDocumentV2 = z.infer<typeof designDocumentV2Schema>;
