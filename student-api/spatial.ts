import type { EdgeRecord, NodeRecord } from '@core/graph';
import { FACE_DIRECTIONS as CORE_FACE_DIRECTIONS, neighbourCell as coreNeighbourCell, type FaceDirection } from '@core/spatial';
import type { AttributeValue } from './attributes';

/**
 * The application's typed spatial representation (schema v2), read-only. Only spatial
 * algorithms receive these. A room is a box of whole cells: `grid` is its minimum corner and
 * `size` its extent in cells along x, y and z.
 */

/** Integer cell address `[x, y, z]`; z is up (the storey axis). */
export type GridCoord = readonly [x: number, y: number, z: number];

/** Room extent in cells `[sx, sy, sz]`, each a positive integer. */
export type RoomSize = readonly [sx: number, sy: number, sz: number];

/**
 * Relationship intent (schema v2). It does NOT require the rooms to touch:
 * - `access`: people can pass (door, floor opening, or a generated connector);
 * - `open`: no separating element (wall removed, floor void, or an open connector).
 */
export type RelationshipKind = 'access' | 'open';

/**
 * The schema-v1 relationship kinds. Still accepted by the `add-edge` operation (mapped to a
 * `RelationshipKind`: door/vertical-access → access, open/atrium → open) and by the deprecated
 * `canConnect`. Edges you read always carry a `RelationshipKind`.
 */
export type SpatialEdgeKind = 'door' | 'open' | 'atrium' | 'vertical-access';

export type { FaceDirection } from '@core/spatial';

/** The six cardinal directions: '+x', '-x', '+y', '-y' (horizontal), '+z', '-z' (vertical). */
export const FACE_DIRECTIONS: readonly FaceDirection[] = CORE_FACE_DIRECTIONS;

/** The neighbouring cell of `cell` in `direction`. Pure grid arithmetic. */
export const neighbourCell = (cell: GridCoord, direction: FaceDirection): GridCoord =>
  coreNeighbourCell([cell[0], cell[1], cell[2]], direction);

/** Every cell of a room (`grid` + `size`), ordered by z, then y, then x. Pure. */
export function roomCells(room: { readonly grid: GridCoord; readonly size: RoomSize }): GridCoord[] {
  const cells: GridCoord[] = [];
  const [x0, y0, z0] = room.grid;
  for (let z = z0; z < z0 + room.size[2]; z++)
    for (let y = y0; y < y0 + room.size[1]; y++) for (let x = x0; x < x0 + room.size[0]; x++) cells.push([x, y, z]);
  return cells;
}

export interface SpatialNode extends NodeRecord {
  readonly typeId: string;
  /** Minimum corner cell of the room. */
  readonly grid: GridCoord;
  /** Extent in cells (`[1, 1, 1]` for a single-cell room). */
  readonly size: RoomSize;
  /** Short label shown to people (e.g. "01"); presentation only, never an identity. */
  readonly displayId?: string | undefined;
  readonly attributes: { readonly [key: string]: AttributeValue };
}

/**
 * Look of a generated straight connector when the rooms do not touch (default `enclosed`):
 * `enclosed` (roof + side walls), `covered` (roof, open sides), `deck` (floor only).
 */
export type ConnectorStyle = 'enclosed' | 'covered' | 'deck';

export interface SpatialEdge extends EdgeRecord {
  readonly kind: RelationshipKind;
  /** Omitted: `enclosed`. Only used if the relationship needs a generated connector. */
  readonly connectorStyle?: ConnectorStyle | undefined;
  readonly attributes: { readonly [key: string]: AttributeValue };
}
