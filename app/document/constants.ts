/**
 * Design document schema v2 — frozen Gate 0 constants (see docs/CONTRACTS-V2.md).
 * Changing any value here is a contract change: it needs the integration owner.
 */

export const SCHEMA_VERSION_V2 = 2 as const;

/**
 * Relationship intent (v2 edge kind). Independent of face adjacency: a relationship between
 * rooms that do not touch is VALID graph data; whether it can be built is a derived status.
 * - `access`: people can pass (door, slab opening + access marker, or a generated connector).
 * - `open`: no separating element (wall removed, slab void, or an open connector).
 */
export const RELATIONSHIP_KINDS = ['access', 'open'] as const;
export type RelationshipKind = (typeof RELATIONSHIP_KINDS)[number];

/** Kind used when the user creates a relationship without choosing one. */
export const DEFAULT_RELATIONSHIP_KIND: RelationshipKind = 'access';

/**
 * Appearance of a generated straight connector ("corridor"; ignored for direct contact).
 * - `enclosed`: floor + roof + two side walls.
 * - `covered` (built-in default since 2026-11-19; was `deck` from 2026-11-17, `enclosed` before):
 *   floor + roof on posts, open sides.
 * - `deck`: floor only.
 * One corridor's style: the relationship's own `connectorStyle` → the design's corridor style
 * (`settings.corridors.style`, Building Designer → Corridors) → DEFAULT_CONNECTOR_STYLE.
 */
export const CONNECTOR_STYLES = ['enclosed', 'covered', 'deck'] as const;
export type ConnectorStyle = (typeof CONNECTOR_STYLES)[number];
export const DEFAULT_CONNECTOR_STYLE: ConnectorStyle = 'covered';

/**
 * Roof of a node type's exposed upward faces (per design, per type). `flat` is the default;
 * `pergola` (additive 2026-11-17) is a roof of open slats; `none` leaves the top open (the pre-v2
 * "open-top" inspection look). Roofs are only ever generated on exposed upward faces, never
 * between stacked rooms. Pitched roofs are not in MVP.
 */
export const ROOF_STYLES = ['flat', 'pergola', 'none'] as const;
export type RoofStyle = (typeof ROOF_STYLES)[number];
export const DEFAULT_ROOF_STYLE: RoofStyle = 'flat';

/**
 * Roof of every generated corridor whose style has one (`enclosed`, `covered`), design-wide
 * (`settings.corridors.roof`, additive 2026-11-19): `flat` slab (default), `pergola` slats, or
 * `none`. A covered corridor without a roof has no posts either, so it looks like a deck; an
 * enclosed corridor without a roof keeps its side walls (open to the sky). Deck never has a roof.
 */
export const DEFAULT_CORRIDOR_ROOF: RoofStyle = 'flat';

/**
 * How a node type's exterior windows are placed along its walls (per design, per type; additive
 * 2026-11-17). Both glaze the same share of the wall (`windowFraction`):
 * - `repeat` (default): one window per cell bay, keeping the wall's proportions, repeated along the wall;
 * - `stretch`: ONE window per façade (a room's exterior walls on one side, all bays and storeys), following its outline with an even frame.
 */
export const WINDOW_LAYOUTS = ['repeat', 'stretch'] as const;
export type WindowLayout = (typeof WINDOW_LAYOUTS)[number];
export const DEFAULT_WINDOW_LAYOUT: WindowLayout = 'repeat';

/**
 * Whether a node type's rooms are enclosed by exterior walls (per design, per type; additive
 * 2026-11-17). `open` leaves out the room's EXTERIOR walls (and their windows), e.g. a pavilion,
 * pergola or terrace; walls shared with another room stay, as the neighbour still needs them.
 * Combine with the roof: open + flat = floor and roof; open + pergola; open + none = floor only.
 */
export const WALL_STYLES = ['enclosed', 'open'] as const;
export type WallStyle = (typeof WALL_STYLES)[number];
export const DEFAULT_WALL_STYLE: WallStyle = 'enclosed';

/**
 * How an imported façade module (3DM) is placed on a room's EXTERIOR walls (additive 2026-11-17,
 * CONTRACTS-V2 §1, owner decision D7):
 * - `repeat`: one module fitted to each 3 m bay (cell width × storey height) of every exterior wall;
 * - `stretch`: one module fitted across each wall run (contiguous, coplanar exterior bays of one
 *   room on one storey, `groupWallRuns`).
 * Width and height are fitted exactly; depth is never scaled. Independent of `WINDOW_LAYOUTS`.
 */
export const FACADE_PLACEMENTS = ['repeat', 'stretch'] as const;
export type FacadePlacement = (typeof FACADE_PLACEMENTS)[number];

/**
 * Optional extra modules of an imported façade for the façade bays that are not plain walls
 * (additive 2026-11-17): `door` for a bay with a door, `open` for a bay with an Open relationship,
 * on the outside of the room (the end of an open-air connector). Each is optional: a condition
 * without its module keeps the automatic geometry (door frame / glass door, open threshold).
 * Always one module per bay (no placement choice).
 */
export const FACADE_VARIANTS = ['door', 'open'] as const;
export type FacadeVariantKind = (typeof FACADE_VARIANTS)[number];

/** Imported façade asset ids are project-level (`ProjectFileV2.assets`): `facade-` + 16 hex digits. */
export const FACADE_ASSET_REF_PATTERN = /^facade-[0-9a-f]{16}$/;

/** Room size per axis in cells. Rooms are axis-aligned boxes anchored at their minimum corner. */
export const DEFAULT_ROOM_SIZE = [1, 1, 1] as const;
export const MAX_ROOM_SIZE = 32;

/** Total occupied room cells in one document (sparse-grid safety limit, in addition to maxNodes). */
export const MAX_ROOM_CELLS = 20000;
