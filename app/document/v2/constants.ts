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
 * Appearance of a generated straight connector (per relationship; ignored for direct contact).
 * - `enclosed`: floor + roof + two side walls (default).
 * - `covered`: floor + roof, open sides.
 * - `deck`: floor only.
 */
export const CONNECTOR_STYLES = ['enclosed', 'covered', 'deck'] as const;
export type ConnectorStyle = (typeof CONNECTOR_STYLES)[number];
export const DEFAULT_CONNECTOR_STYLE: ConnectorStyle = 'deck';

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

/** Room size per axis in cells. Rooms are axis-aligned boxes anchored at their minimum corner. */
export const DEFAULT_ROOM_SIZE = [1, 1, 1] as const;
export const MAX_ROOM_SIZE = 32;

/** Total occupied room cells in one document (sparse-grid safety limit, in addition to maxNodes). */
export const MAX_ROOM_CELLS = 20000;

/** v1 → v2 edge-kind mapping (see migrateV1toV2). Direction comes from the rooms' contact. */
export const V1_KIND_TO_RELATIONSHIP = {
  door: 'access',
  'vertical-access': 'access',
  open: 'open',
  atrium: 'open',
} as const satisfies Record<string, RelationshipKind>;
