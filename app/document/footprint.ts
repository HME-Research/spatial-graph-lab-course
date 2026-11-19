import { FACE_DIRECTIONS, gridKey, neighbourCell, type FaceDirection, type GridCoord } from '@core/spatial';
import type { RoomNode, RoomSize } from './schema';

/**
 * Room footprints — FROZEN Gate 0 semantics. A room is an axis-aligned box of whole cells
 * anchored at its MINIMUM corner `position`, extending `size` cells along +x, +y, +z.
 * Pure grid maths; no rendering units.
 */

type Boxed = { readonly position: GridCoord; readonly size: RoomSize };

/** Inclusive cell bounds of a room. */
export interface CellBox {
  readonly min: GridCoord;
  readonly max: GridCoord;
}

export const footprintBox = (room: Boxed): CellBox => ({
  min: [room.position[0], room.position[1], room.position[2]],
  max: [room.position[0] + room.size[0] - 1, room.position[1] + room.size[1] - 1, room.position[2] + room.size[2] - 1],
});

export const footprintCellCount = (room: Boxed): number => room.size[0] * room.size[1] * room.size[2];

/** Every cell of the room, ordered by z, then y, then x (deterministic). */
export function footprintCells(room: Boxed): GridCoord[] {
  const { min, max } = footprintBox(room);
  const cells: GridCoord[] = [];
  for (let z = min[2]; z <= max[2]; z++)
    for (let y = min[1]; y <= max[1]; y++) for (let x = min[0]; x <= max[0]; x++) cells.push([x, y, z]);
  return cells;
}

export const footprintContains = (room: Boxed, cell: GridCoord): boolean => {
  const { min, max } = footprintBox(room);
  return [0, 1, 2].every((a) => cell[a]! >= min[a]! && cell[a]! <= max[a]!);
};

const rangesOverlap = (aMin: number, aMax: number, bMin: number, bMax: number) => aMin <= bMax && bMin <= aMax;

export function footprintsOverlap(a: Boxed, b: Boxed): boolean {
  const A = footprintBox(a);
  const B = footprintBox(b);
  return [0, 1, 2].every((i) => rangesOverlap(A.min[i]!, A.max[i]!, B.min[i]!, B.max[i]!));
}

/** z levels (storeys) the room spans, inclusive. */
export const levelRange = (room: Boxed): readonly [number, number] => [room.position[2], room.position[2] + room.size[2] - 1];

/** One unit face between a cell of room `a` and a face-adjacent cell of room `b`. */
export interface SharedFace {
  /** The cell of room `a`. */
  readonly cell: GridCoord;
  /** Outward from `a`'s cell towards `b`. */
  readonly direction: FaceDirection;
}

/**
 * Every unit face where `a` touches `b`, seen from `a` (cell of `a` + outward direction).
 * Ordered by FACE_DIRECTIONS, then z, y, x. Empty if the rooms do not touch. Overlapping rooms
 * (invalid documents) are not specially handled.
 */
export function sharedFaces(a: Boxed, b: Boxed): SharedFace[] {
  const bKeys = new Set(footprintCells(b).map(gridKey));
  const cells = footprintCells(a);
  const faces: SharedFace[] = [];
  for (const direction of FACE_DIRECTIONS) {
    for (const cell of cells) if (bKeys.has(gridKey(neighbourCell(cell, direction)))) faces.push({ cell, direction });
  }
  return faces;
}

/** How two rooms touch: through walls, through a floor/ceiling, or not at all. */
export type RoomContact = 'horizontal' | 'vertical' | null;

export function roomContact(a: Boxed, b: Boxed): RoomContact {
  const faces = sharedFaces(a, b);
  if (faces.length === 0) return null;
  return faces[0]!.direction === '+z' || faces[0]!.direction === '-z' ? 'vertical' : 'horizontal';
}

/** Convenience for a node record. */
export const roomCells = (node: RoomNode): GridCoord[] => footprintCells(node);
