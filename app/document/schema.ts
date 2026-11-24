import { z } from 'zod';
import {
  attributesSchema,
  diagramSchema,
  positionSchema,
  metadataSchema,
  functionIdSchema,
} from './primitives';
import {
  BOUNDARY_SHIFTS,
  type BoundaryShift,
  DEFAULT_ROOM_SIZE,
  FACADE_ASSET_REF_PATTERN,
  FACADE_PLACEMENTS,
  MAX_ROOM_SIZE,
  RELATIONSHIP_KINDS,
  ROOF_STYLES,
  MAX_CORRIDOR_WIDTH,
  WINDOW_LAYOUTS,
  WALL_STYLES,
  SCHEMA_VERSION_V2,
} from './constants';

/**
 * Design document schema v2 (structure only; graph and footprint invariants live in
 * validate.ts). See docs/CONTRACTS-V2.md.
 *
 * - Node and edge `id`s are plain non-negative integers (P4), the permanent identity and the label
 *   shown everywhere. New ids come from the counters `nextNodeId` / `nextEdgeId` (`allocate…`), so
 *   an id is never reused after a delete. Counters missing in a file are filled on read (largest
 *   id + 1, or 1); they are always written.
 * - `position` is the room's MINIMUM corner cell [x, y, z] (z up); `size` is [sx, sy, sz], positive
 *   integers. The room occupies every cell position + [0..sx-1, 0..sy-1, 0..sz-1].
 * - Edge `relationship` is the relationship intent (`access` | `open`), independent of adjacency.
 * - Edge `corridor` is optional (`{ walls?, roof?, width? }`); each absent field uses the design's corridor
 *   card, else the built-in default (resolved on read, `corridorLookOf`).
 * - `settings.styleBy` / `settings.styles` (2026-11-18, replaced `typeAppearance`): the rooms are
 *   styled by ONE attribute; each attribute's setup (Default, value cards or number bands) is
 *   remembered. Effective looks are resolved on read (`settings.ts`), never materialised.
 * - `settings.corridors` (optional, 2026-11-19): the Corridors look card, `{ walls?, roof?, width? }` of
 *   every generated corridor; each field absent = built-in default. Omitted when empty.
 * - `diagram.positions` stay independent 2D diagram coordinates.
 */

/** Node and edge ids (P4): whole numbers 0, 1, 2, … */
export const itemIdSchema = z
  .int({ error: 'ids must be whole numbers (e.g. 3)' })
  .min(0, { error: 'ids must not be negative' })
  .max(Number.MAX_SAFE_INTEGER, { error: 'id is too large' });

/** A counter for new ids: the next id to give (never lowered). */
const idCounterSchema = z.int({ error: 'id counters must be whole numbers' }).min(0, { error: 'id counters must not be negative' }).max(Number.MAX_SAFE_INTEGER);

const sizeIntSchema = z
  .int({ error: 'size components must be integers' })
  .min(1, { error: 'size components must be at least 1' })
  .max(MAX_ROOM_SIZE, { error: `size components must be at most ${MAX_ROOM_SIZE}` });

export const sizeSchema = z.tuple([sizeIntSchema, sizeIntSchema, sizeIntSchema], {
  error: 'size must be an array of three positive integers [sx, sy, sz]',
});

export const relationshipKindSchema = z.enum(RELATIONSHIP_KINDS, {
  error: `relationship must be one of: ${RELATIONSHIP_KINDS.join(', ')}`,
});

export const boundaryShiftSchema = z.enum(BOUNDARY_SHIFTS, {
  error: `boundaryShift must be one of: ${BOUNDARY_SHIFTS.join(', ')}`,
});

export const windowLayoutSchema =z.enum(WINDOW_LAYOUTS, { error: `windowLayout must be one of: ${WINDOW_LAYOUTS.join(', ')}` });

export const wallStyleSchema = z.enum(WALL_STYLES, { error: `walls must be one of: ${WALL_STYLES.join(', ')}` });

export const roofStyleSchema = z.enum(ROOF_STYLES, { error: `roof must be one of: ${ROOF_STYLES.join(', ')}` });

const CORRIDOR_WIDTH_RANGE = `width must be more than 0 and at most ${MAX_CORRIDOR_WIDTH} m (one cell)`;

/** A corridor's built width in metres, centred in its cells: 0 < width ≤ one cell (2026-11-19). */
export const corridorWidthSchema = z
  .number({ error: 'width must be a number of metres' })
  .refine(Number.isFinite, { error: 'width must be finite' })
  .gt(0, { error: CORRIDOR_WIDTH_RANGE })
  .max(MAX_CORRIDOR_WIDTH, { error: CORRIDOR_WIDTH_RANGE });

/**
 * Look of a generated corridor (owner 2026-11-19, "Corridors as a look card"; `width` added the
 * same day): walls, roof and width, each optional (absent = inherit). Used by the design's
 * Corridors card (`settings.corridors`) and by one relationship's own override (edge `corridor`).
 */
export const corridorLookSchema = z.strictObject({
  walls: wallStyleSchema.optional(),
  roof: roofStyleSchema.optional(),
  width: corridorWidthSchema.optional(),
});

export const windowFractionSchema = z
  .number({ error: 'windowFraction must be a number' })
  .refine(Number.isFinite, { error: 'windowFraction must be finite' })
  .min(0, { error: 'windowFraction must be between 0 and 1' })
  .max(1, { error: 'windowFraction must be between 0 and 1' });

export const roomNodeSchema = z.strictObject({
  id: itemIdSchema,
  function: functionIdSchema,
  position: positionSchema,
  size: sizeSchema.default([...DEFAULT_ROOM_SIZE]),
  /** The node's custom attributes (project fields and any other stored values). */
  custom: attributesSchema.default({}),
});

export const relationshipEdgeSchema = z.strictObject({
  id: itemIdSchema,
  source: itemIdSchema,
  target: itemIdSchema,
  relationship: relationshipKindSchema,
  /** This relationship's own corridor walls / roof / width (Properties); absent fields use the design's. */
  corridor: corridorLookSchema.optional(),
  /**
   * Requested boundary shift (additive 2026-11-24): absent = `none`. Only a request: whether it is
   * applied is derived from the geometry (`resolveBoundaryShifts`, app/building), never stored.
   */
  boundaryShift: boundaryShiftSchema.optional(),
  /** The edge's custom attributes. */
  custom: attributesSchema.default({}),
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
  /**
   * Imported façade module, or `'none'`: no module even when Default has one (a card only; owner
   * 2026-11-18). Absent = inherit (none unless Default sets one).
   */
  facade: z.union([facadeModuleSchema, z.literal('none')]).optional(),
});

/**
 * Which attribute the rooms are styled by (owner 2026-11-18): the room's Function (`function`), its
 * Level (`position[2]`), a custom attribute by its permanent field id, or a measured value (metric id).
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
 *
 * A number can use either (S3, 2026-11-19): `mode` says which is active, and both are remembered.
 * Absent `mode` = bands when `dividers` are stored, else value cards; `'bands'` needs dividers.
 */
export const STYLE_MODES = ['values', 'bands'] as const;
export type StyleMode = (typeof STYLE_MODES)[number];

export const styleSetupSchema = z
  .strictObject({
    default: lookSchema.optional(),
    groups: z.array(styleGroupSchema).optional(),
    dividers: z.array(z.number().finite()).max(20).optional(),
    bands: z.array(lookSchema).optional(),
    mode: z.enum(STYLE_MODES, { error: `mode must be one of: ${STYLE_MODES.join(', ')}` }).optional(),
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
    if (setup.mode === 'bands' && setup.dividers === undefined) ctx.addIssue({ code: 'custom', path: ['mode'], message: 'mode "bands" needs band dividers' });
  });

/** Comparison key of a card value: text is trimmed and case-insensitive; numbers and Yes/No exact. */
export const styleValueKey = (value: string | number | boolean): string =>
  typeof value === 'string' ? `s:${value.trim().toLowerCase()}` : `${typeof value}:${String(value)}`;

export const designSettingsSchema = z.strictObject({
  /** The attribute the rooms are styled by. */
  styleBy: styleBySchema.default('function'),
  /** Remembered setup per attribute (switching `styleBy` back restores it). */
  styles: z.record(styleBySchema, styleSetupSchema).default({}),
  /** The Corridors look card: walls, roof and width of every generated corridor (absent = built-in defaults). */
  corridors: corridorLookSchema.optional(),
});

/** The counter value that follows every id in `items` (1 for none). */
export const counterAfter = (items: readonly { readonly id: number }[]): number => items.reduce((n, item) => Math.max(n, item.id + 1), 1);

export const designDocumentV2Schema = z
  .strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION_V2),
    metadata: metadataSchema,
    /** The id the next new node gets. Optional in a file (filled on read); always written. */
    nextNodeId: idCounterSchema.optional(),
    /** The id the next new edge gets. Optional in a file (filled on read); always written. */
    nextEdgeId: idCounterSchema.optional(),
    nodes: z.array(roomNodeSchema),
    edges: z.array(relationshipEdgeSchema),
    diagram: diagramSchema.default({ positions: {} }),
    settings: designSettingsSchema.default({ styleBy: 'function', styles: {} }),
  })
  .transform(({ nextNodeId, nextEdgeId, ...doc }) => ({
    schemaVersion: doc.schemaVersion,
    metadata: doc.metadata,
    nextNodeId: nextNodeId ?? counterAfter(doc.nodes),
    nextEdgeId: nextEdgeId ?? counterAfter(doc.edges),
    nodes: doc.nodes,
    edges: doc.edges,
    diagram: doc.diagram,
    settings: doc.settings,
  }));

export type RoomSize = z.infer<typeof sizeSchema>;
export type RoomNode = z.infer<typeof roomNodeSchema>;
export type RelationshipEdge = z.infer<typeof relationshipEdgeSchema>;

/** The edge's requested boundary shift (absent = `none`). */
export const boundaryShiftOf = (edge: { readonly boundaryShift?: BoundaryShift | undefined }): BoundaryShift => edge.boundaryShift ?? 'none';
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
/** Stored corridor look (each field optional = inherit). */
export type CorridorLook = z.infer<typeof corridorLookSchema>;
export type DesignDocumentV2 = z.infer<typeof designDocumentV2Schema>;
