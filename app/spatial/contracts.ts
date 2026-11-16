import type { GridCoord } from '@core/spatial';
import type { GraphIssue } from '@app/document';
import type {
  ConnectorStyle,
  DesignDocumentV2,
  RelationshipKind,
  RoomSize,
  SharedFace,
} from '@app/document/v2';

/**
 * Spatial relationship resolution, occupancy and spatial edits — FROZEN Gate 0 contract
 * (docs/CONTRACTS-V2.md). Everything here is DERIVED from a validated v2 document and never
 * saved: an edge's spatial status is not graph validity. Pure data in grid space.
 */

// ── Relationship resolution ────────────────────────────────────────────────────────────────

export type ResolutionStatus = 'direct' | 'routed' | 'unresolved';

/**
 * Why a relationship cannot be built in the MVP. Display/building state, not an error.
 * - `different-level`: separated rooms with no common storey (no stairs/ramps in MVP).
 * - `not-aligned`: common storey, but no straight axis-aligned line joins facing faces.
 * - `blocked-by-room`: every straight candidate passes through a room cell.
 * - `blocked-by-route`: every free-of-rooms candidate crosses an earlier route's cells.
 * - `endpoint-clearance`: reserved for an endpoint clearance rule (02 defines it or never emits it).
 * - `preferred-face-unavailable`: the student chose a wall for this relationship and that wall is no
 *   longer shared by the two rooms. The relationship is kept and NOTHING is built elsewhere.
 * - `routing-unavailable`: GATE 0 STUB ONLY — straight routing not implemented yet. 02 must stop
 *   emitting it; nothing may depend on it.
 */
export type UnresolvedReason =
  | 'different-level'
  | 'not-aligned'
  | 'blocked-by-room'
  | 'blocked-by-route'
  | 'endpoint-clearance'
  | 'routing-unavailable'
  /** Gate F: the edge's preferred face (scenario sidecar) is no longer a face shared by its rooms. */
  | 'preferred-face-unavailable';

/** A unit face of a room: the room's cell and the outward direction. */
export interface RoomFace extends SharedFace {
  readonly nodeId: string;
}

/**
 * A generated straight connector. Cells are the empty cells strictly between the two room
 * faces, ordered from `from` to `to`; all on one storey (`level`) and one horizontal axis.
 */
export interface ConnectorRoute {
  readonly edgeId: string;
  readonly axis: 'x' | 'y';
  readonly level: number;
  readonly cells: readonly GridCoord[];
  /** Face of the edge's SOURCE room where the connector starts. */
  readonly from: RoomFace;
  /** Face of the edge's TARGET room where the connector ends. */
  readonly to: RoomFace;
  /** Effective style (`connectorStyleOf(edge)`). */
  readonly style: ConnectorStyle;
}

interface ResolutionBase {
  readonly edgeId: string;
  readonly kind: RelationshipKind;
}

/**
 * Derived per-edge result. (The gate text's `{ status, reason?, routeCells?, connectorStyle? }`
 * is this discriminated union: `routeCells` = `route.cells`, `connectorStyle` = `route.style`.)
 * - direct: the rooms touch. `faces` = every shared unit face seen from the SOURCE room.
 *   horizontal access → door; horizontal open → no wall; vertical access → slab opening + access
 *   marker; vertical open → slab void (v1KindFor gives the equivalent v1 kind).
 * - routed: same-storey straight connector (cells reserved in the occupancy).
 * - unresolved: no physical connection; drawn as a muted red dashed edge; never removed.
 */
export type EdgeResolution =
  | (ResolutionBase & {
      readonly status: 'direct';
      readonly contact: 'horizontal' | 'vertical';
      readonly faces: readonly SharedFace[];
      /** Gate F: the student's chosen face (seen from the SOURCE), from `resolveWithPreferences`. */
      readonly preferredFace?: SharedFace;
    })
  | (ResolutionBase & { readonly status: 'routed'; readonly route: ConnectorRoute })
  | (ResolutionBase & { readonly status: 'unresolved'; readonly reason: UnresolvedReason; readonly message: string });

// ── Occupancy (rooms + generated connector reservations, one API) ──────────────────────────

export type CellOccupant =
  | { readonly kind: 'room'; readonly nodeId: string }
  | { readonly kind: 'route'; readonly edgeId: string };

export interface Occupancy {
  /** Occupant keyed by `gridKey(cell)`. Room cells are never also route cells. */
  readonly cells: ReadonlyMap<string, CellOccupant>;
  at(cell: GridCoord): CellOccupant | undefined;
}

/** Everything derived from one document. Deterministic: same document → equal result. */
export interface SpatialResolution {
  /** One entry per edge, in document edge order. */
  readonly edges: readonly EdgeResolution[];
  readonly byEdge: ReadonlyMap<string, EdgeResolution>;
  readonly occupancy: Occupancy;
}

/**
 * Resolves every relationship of a VALIDATED v2 document. Routing order and tie-breaks (02):
 * edges are resolved in ascending edge-id order (string comparison), each routed edge reserving
 * its cells before the next; candidate straight lines are compared by length, then axis x before
 * y, then lowest storey, then lowest perpendicular coordinate; the first candidate whose cells
 * are free of rooms and earlier routes wins.
 */
export type RelationshipResolver = (doc: DesignDocumentV2) => SpatialResolution;

// ── Spatial edits (move / resize) ─────────────────────────────────────────────────────────

/**
 * Proposed new placement of one room. `grid` (new minimum corner) and/or `size`; omitted values
 * stay. Resizing is anchored at the MINIMUM corner: changing `size` alone never moves `grid`.
 * Whole cells only; callers snap world-space drags to integers before proposing.
 */
export interface SpatialEditRequest {
  readonly nodeId: string;
  readonly grid?: GridCoord;
  readonly size?: RoomSize;
}

/** How one relationship's derived status changes because of an edit. */
export interface EdgeImpact {
  readonly edgeId: string;
  readonly before: ResolutionStatus;
  readonly after: ResolutionStatus;
}

/**
 * Result of `proposeSpatialEdit` (pure preview; nothing is applied):
 * - rejected: invalid request or overlap with another ROOM (always refused). `collidingRooms`
 *   lists the room ids hit.
 * - ok: `next` is the validated document; `impacted` lists edges whose status changes.
 * - needs-confirmation: the room would take cells reserved by generated connectors
 *   (`displacedRoutes` = their edge ids). The UI offers Cancel or "Move anyway and recalculate";
 *   only the latter commits `next` (relationships are kept; their routes are recalculated and may
 *   become unresolved). Never silently rerouted.
 */
export type SpatialEditProposal =
  | { readonly status: 'rejected'; readonly issues: readonly GraphIssue[]; readonly collidingRooms: readonly string[] }
  | { readonly status: 'ok'; readonly next: DesignDocumentV2; readonly impacted: readonly EdgeImpact[] }
  | {
      readonly status: 'needs-confirmation';
      readonly next: DesignDocumentV2;
      readonly displacedRoutes: readonly string[];
      readonly impacted: readonly EdgeImpact[];
    };
