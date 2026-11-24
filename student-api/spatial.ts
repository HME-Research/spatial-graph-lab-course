import type { EdgeRecord, NodeRecord } from './graph';
import { FACE_DIRECTIONS as CORE_FACE_DIRECTIONS, neighbourCell as coreNeighbourCell, type FaceDirection } from '@core/spatial';
import type { AttributeValue } from './attributes';

/**
 * The application's typed spatial representation (schema v2), read-only. Only spatial
 * algorithms receive these. A room is a box of whole cells: `position` is its minimum corner and
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

export type { FaceDirection } from '@core/spatial';

/** The six cardinal directions: '+x', '-x', '+y', '-y' (horizontal), '+z', '-z' (vertical). */
export const FACE_DIRECTIONS: readonly FaceDirection[] = CORE_FACE_DIRECTIONS;

/** The neighbouring cell of `cell` in `direction`. Pure grid arithmetic. */
export const neighbourCell = (cell: GridCoord, direction: FaceDirection): GridCoord =>
  coreNeighbourCell([cell[0], cell[1], cell[2]], direction);

/** Every cell of a room (`position` + `size`), ordered by z, then y, then x. Pure. */
export function roomCells(room: { readonly position: GridCoord; readonly size: RoomSize }): GridCoord[] {
  const cells: GridCoord[] = [];
  const [x0, y0, z0] = room.position;
  for (let z = z0; z < z0 + room.size[2]; z++)
    for (let y = y0; y < y0 + room.size[1]; y++) for (let x = x0; x < x0 + room.size[0]; x++) cells.push([x, y, z]);
  return cells;
}

export interface SpatialNode extends NodeRecord {
  readonly function: string;
  /** Minimum corner cell of the room. */
  readonly position: GridCoord;
  /** Extent in cells (`[1, 1, 1]` for a single-cell room). */
  readonly size: RoomSize;
  /** Custom attributes (the project's fields and any other stored values). */
  readonly custom: { readonly [key: string]: AttributeValue };
}

/** Walls of a generated corridor: `enclosed` (a side wall on each side) or `open` (open sides). */
export type CorridorWalls = 'enclosed' | 'open';

/** Roof of a generated corridor: `flat`, `pergola` (open slats) or `none` (open to the sky). */
export type CorridorRoof = 'flat' | 'pergola' | 'none';

/**
 * A relationship's own corridor look, used only when the rooms do not touch and a straight
 * corridor is generated. Each omitted field uses the design's Corridors card (Building Designer),
 * whose built-in default is open walls with a flat roof, 1.5 m wide.
 */
export interface CorridorLook {
  readonly walls?: CorridorWalls | undefined;
  readonly roof?: CorridorRoof | undefined;
  /**
   * Built width in metres, centred in the corridor's cells: more than 0 and at most one cell
   * (3 m). Only how it looks: the corridor still takes its whole cells.
   */
  readonly width?: number | undefined;
}

/**
 * A requested boundary shift (2026-11-24): move the wall the edge's two rooms share 1.5 m into the
 * `source` room (`toward-source`: the source loses area, the target gains it) or into the `target`
 * room (`toward-target`). Only a REQUEST: whether the app applies it is a calculated value
 * (`ctx.metrics.value('boundary-shift-applied', edge.id)`, and `'boundary-shift-status'` for why
 * not). Positions, sizes and the grid never change; read `'area'` (nominal, whole cells) and
 * `'actual-area'` (after applied shifts) as calculated values.
 */
export type BoundaryShift = 'none' | 'toward-source' | 'toward-target';

export interface SpatialEdge extends EdgeRecord {
  readonly relationship: RelationshipKind;
  /** Omitted: the design's Corridors card. Only used if the relationship needs a generated corridor. */
  readonly corridor?: CorridorLook | undefined;
  /** The requested boundary shift; omitted = `'none'`. Change it with `set-edge-boundary-shift`. */
  readonly boundaryShift?: BoundaryShift | undefined;
  /** Custom attributes (the project's fields and any other stored values). */
  readonly custom: { readonly [key: string]: AttributeValue };
}
