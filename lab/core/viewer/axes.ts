import type { WorldPoint } from './coordinates';

/**
 * The single adapter from a Z-up world (a future SpatialCore / Rhino 3DM source: x east, y north,
 * z up, right-handed) into the Three.js Y-up world used by every viewer.
 *
 * It uses the same axis convention as `spatialToThree` (core/viewer/coordinates.ts), which remains
 * the only grid → Three mapping:
 *
 *   three.X =  x * unitScale
 *   three.Y =  z * unitScale
 *   three.Z = -y * unitScale
 *
 * Unlike `spatialToThree` it takes continuous model coordinates (not cell indices), so there is no
 * cell size and no half-storey offset; `unitScale` converts model units to metres (1 for metres,
 * 0.001 for millimetres). Pure.
 */
export function zUpToYUp(point: readonly [x: number, y: number, z: number], unitScale = 1): WorldPoint {
  if (!Number.isFinite(unitScale) || unitScale <= 0) throw new RangeError(`unitScale must be a positive finite number, got ${unitScale}`);
  const [x, y, z] = point;
  // `+ 0` normalises -0 to 0 so results compare cleanly (as in spatialToThree).
  return [x * unitScale + 0, z * unitScale + 0, -y * unitScale + 0];
}
