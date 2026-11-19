import type { RoofStyle } from '@app/document';
import type { BuildingFace } from './multicellFaces';

/**
 * Flat-roof policy (03-building). Pure.
 *
 * A roof exists only on an EXPOSED upward face: a `+z` face whose cell above is unoccupied
 * (`condition === 'exterior'`). Consequently:
 * - stacked rooms never get a roof between them (that face is `solid`, an atrium or an access
 *   opening — a slab, never a roof);
 * - a room with size z > 1 gets a roof on its top storey only (inner storeys have no face);
 * - a room top under a generated connector is a `solid` slab, never a roof;
 * - partially covered tops are roofed per unit face, exactly over the exposed part.
 * No pitched roofs in the MVP. `roof: 'none'` (per design, per type) leaves the top open;
 * `pergola` keeps the face and lays it out as open slats (faceLayout).
 */

export const isExposedTop = (face: Pick<BuildingFace, 'direction' | 'condition'>): boolean =>
  face.direction === '+z' && face.condition === 'exterior';

/** Drop exposed tops of types whose effective roof style is `none`; keep everything else (flat and pergola). */
export function applyRoofPolicy<F extends Pick<BuildingFace, 'direction' | 'condition' | 'ownerFunction'>>(
  faces: readonly F[],
  roofOf: (functionId: string) => RoofStyle,
): F[] {
  return faces.filter((f) => !isExposedTop(f) || roofOf(f.ownerFunction) !== 'none');
}
