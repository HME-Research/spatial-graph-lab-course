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
  FACADE_ASSET_REF_PATTERN,
  FACADE_PLACEMENTS,
  MAX_ROOM_SIZE,
  RELATIONSHIP_KINDS,
  ROOF_STYLES,
  WINDOW_LAYOUTS,
  WALL_STYLES,
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
 * - `settings.styleBy` / `settings.styles` (2026-11-18, replaced `typeAppearance`): the rooms are
 *   styled by ONE attribute; each attribute's setup (Default, value cards or number bands) is
 *   remembered. Effective looks are resolved on read (`settings.ts`), never materialised.
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

export const wallStyleSchema = z.enum(WALL_STYLES, { error: `walls must be one of: ${WALL_STYLES.join(', ')}` });

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

/**
 * An imported façade module (additive 2026-11-17): a project asset id (the asset itself lives in
 * the project file, never in the design) and how it is placed on exterior walls.
 */
const facadeAssetRefSchema = z.string().regex(FACADE_ASSET_REF_PATTERN, { error: 'assetId must be "facade-" followed by 16 hex digits' });

/** The module of one bay condition (`FACADE_VARIANTS`): always one per bay, so no placement. */
export const facadeVariantSchema = z.strictObject({
  assetId: facadeAssetRefSchema,
  /** Turned round: the model's +Y side faces outside. */
  flip: z.literal(true).optional(),
});

export const facadeModuleSchema = z.strictObject({
  assetId: facadeAssetRefSchema,
  placement: z.enum(FACADE_PLACEMENTS, { error: `placement must be one of: ${FACADE_PLACEMENTS.join(', ')}` }),
  /** Turned round: the model's +Y side faces outside (default: its −Y side, Rhino's Front view). */
  flip: z.literal(true).optional(),
  /** Optional module for façade bays with a door (absent: the automatic door). */
  door: facadeVariantSchema.optional(),
  /** Optional module for façade bays with an Open relationship (absent: the automatic open side). */
  open: facadeVariantSchema.optional(),
});

/** What one Designer card sets. Every field is optional: absent = inherit (group → Default → toolkit → built-in). */
export const lookSchema = z.strictObject({
  windowFraction: windowFractionSchema.optional(),
  windowLayout: windowLayoutSchema.optional(),
  walls: wallStyleSchema.optional(),
  roof: roofStyleSchema.optional(),
  /** Imported façade module. Absent = inherit (none unless Default sets one). */
  facade: facadeModuleSchema.optional(),
});

/**
 * Which attribute the rooms are styled by (owner 2026-11-18): the room's Function (`typeId`), its
 * Level (`grid[2]`), a custom attribute by its permanent field id, or a measured value (metric id).
 */
export const STYLE_BY_PATTERN = /^(function|level|attribute:[A-Za-z][A-Za-z0-9_-]{0,63}|metric:[a-z][a-z0-9-]{0,63})$/;
export const styleBySchema = z.string().regex(STYLE_BY_PATTERN, {
  error: 'styleBy must be "function", "level", "attribute:<field id>" or "metric:<metric id>"',
});

/** A value card: rooms whose value equals `value` (text: trimmed, case-insensitive). */
export const styleGroupSchema = z.strictObject({
  value: z.union([z.string().min(1).max(200), z.number().finite(), z.boolean()]),
  look: lookSchema,
});

/**
 * One attribute's setup. Value attributes use `groups`; numbers use `dividers` + `bands`
 * (band i = [dividers[i-1], dividers[i]), the first and last open-ended). Rooms without a value,
 * or matching no card, use `default`.
 */
export const styleSetupSchema = z
  .strictObject({
    default: lookSchema.optional(),
    groups: z.array(styleGroupSchema).optional(),
    dividers: z.array(z.number().finite()).max(20).optional(),
    bands: z.array(lookSchema).optional(),
  })
  .superRefine((setup, ctx) => {
    const seen = new Set<string>();
    setup.groups?.forEach((g, i) => {
      const key = styleValueKey(g.value);
      if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['groups', i, 'value'], message: `duplicate card value ${JSON.stringify(g.value)}` });
      seen.add(key);
    });
    const dividers = setup.dividers ?? [];
    for (let i = 1; i < dividers.length; i++) {
      if (!(dividers[i]! > dividers[i - 1]!)) ctx.addIssue({ code: 'custom', path: ['dividers', i], message: 'band dividers must be strictly ascending' });
    }
    if ((setup.dividers === undefined) !== (setup.bands === undefined) || (setup.bands && setup.bands.length !== dividers.length + 1)) {
      ctx.addIssue({ code: 'custom', path: ['bands'], message: 'bands must have exactly one look more than there are dividers' });
    }
  });

/** Comparison key of a card value: text is trimmed and case-insensitive; numbers and Yes/No exact. */
export const styleValueKey = (value: string | number | boolean): string =>
  typeof value === 'string' ? `s:${value.trim().toLowerCase()}` : `${typeof value}:${String(value)}`;

export const designSettingsSchema = z.strictObject({
  /** The attribute the rooms are styled by. */
  styleBy: styleBySchema.default('function'),
  /** Remembered setup per attribute (switching `styleBy` back restores it). */
  styles: z.record(styleBySchema, styleSetupSchema).default({}),
});

export const designDocumentV2Schema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION_V2),
  metadata: metadataSchema,
  nodes: z.array(roomNodeSchema),
  edges: z.array(relationshipEdgeSchema),
  diagram: diagramSchema.default({ positions: {} }),
  settings: designSettingsSchema.default({ styleBy: 'function', styles: {} }),
});

export type RoomSize = z.infer<typeof sizeSchema>;
export type RoomNode = z.infer<typeof roomNodeSchema>;
export type RelationshipEdge = z.infer<typeof relationshipEdgeSchema>;
export type Look = z.infer<typeof lookSchema>;
export type StyleBy = z.infer<typeof styleBySchema>;
export type StyleGroup = z.infer<typeof styleGroupSchema>;
export type StyleSetup = z.infer<typeof styleSetupSchema>;
export type StyleValue = StyleGroup['value'];
export type FacadeModule = z.infer<typeof facadeModuleSchema>;
export type FacadeVariant = z.infer<typeof facadeVariantSchema>;

/** Canonical copy (key order, `flip` only when true, variants only when set): for writing and comparing. */
export function canonicalFacadeModule(m: FacadeModule): FacadeModule {
  const variant = (v: FacadeVariant): FacadeVariant => ({ assetId: v.assetId, ...(v.flip ? { flip: true as const } : {}) });
  return {
    assetId: m.assetId,
    placement: m.placement,
    ...(m.flip ? { flip: true as const } : {}),
    ...(m.door ? { door: variant(m.door) } : {}),
    ...(m.open ? { open: variant(m.open) } : {}),
  };
}

/** Equal modules (null = none). */
export const sameFacadeModule = (a: FacadeModule | null | undefined, b: FacadeModule | null | undefined): boolean =>
  (a ?? null) === (b ?? null) || (!!a && !!b && JSON.stringify(canonicalFacadeModule(a)) === JSON.stringify(canonicalFacadeModule(b)));
export type DesignSettings = z.infer<typeof designSettingsSchema>;
export type DesignDocumentV2 = z.infer<typeof designDocumentV2Schema>;
