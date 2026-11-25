import type { RelationshipKind, RoomContact } from '@app/document';
import type { ConnectionCondition, FaceDirection, FaceOrientation } from './contracts';

/**
 * Small pure face-resolution helpers (grid space only: no React, no Three.js, no world units).
 * Faces of rooms are resolved by `resolveBuildingFaces` (multicellFaces.ts).
 */

export const directionOrientation = (direction: FaceDirection): FaceOrientation =>
  direction === '+z' || direction === '-z' ? 'slab' : 'wall';

/** Re-exported from core/spatial for existing callers. */
export { neighbourCell } from '@core/spatial';

/**
 * The face condition a DIRECT relationship gives the faces its rooms share, or null when the rooms
 * do not touch: side by side, `access` = door and `open` = no wall; stacked, `access` = slab
 * opening with an access marker (`vertical-access`) and `open` = slab void (`atrium`).
 */
export function connectionCondition(kind: RelationshipKind, contact: RoomContact): ConnectionCondition | null {
  if (contact === null) return null;
  if (kind === 'access') return contact === 'horizontal' ? 'door' : 'vertical-access';
  return contact === 'horizontal' ? 'open' : 'atrium';
}
