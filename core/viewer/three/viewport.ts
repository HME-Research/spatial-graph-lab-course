import type { WorldPoint } from '../coordinates';

/**
 * Plain-data description of a 3D viewport (pure: no React, no Three.js): camera placement and an
 * optional ground reference grid. What to frame is decided by the application's scene model.
 */

/** Axis-aligned box in Three.js world space. */
export interface Bounds {
  readonly min: WorldPoint;
  readonly max: WorldPoint;
}

export interface CameraFit {
  readonly target: WorldPoint;
  readonly position: WorldPoint;
  readonly near: number;
  readonly far: number;
}

/** A square reference grid on the ground plane (Three.js GridHelper parameters). */
export interface GroundGrid {
  readonly center: WorldPoint;
  readonly size: number;
  readonly divisions: number;
}

/** Viewing direction (from target towards camera): front-right, above. */
const VIEW_DIRECTION: WorldPoint = (() => {
  const v = [1, 0.85, 1.25];
  const l = Math.hypot(v[0]!, v[1]!, v[2]!);
  return [v[0]! / l, v[1]! / l, v[2]! / l] as const;
})();

/**
 * Camera placement that frames `bounds` for a perspective camera with vertical field of view
 * `fovDeg`. The bounding sphere radius is at least `minRadius`, so tiny scenes are not over-zoomed.
 */
export function fitCameraToBounds(bounds: Bounds, fovDeg: number, minRadius: number): CameraFit {
  const b = bounds;
  const target: WorldPoint = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
  const radius = Math.max(
    Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2,
    minRadius,
  );
  // 1.25 margin keeps the scene inside narrow (split) panels too.
  const distance = (radius / Math.sin(((fovDeg / 2) * Math.PI) / 180)) * 1.25;
  return {
    target,
    position: [
      target[0] + VIEW_DIRECTION[0] * distance,
      target[1] + VIEW_DIRECTION[1] * distance,
      target[2] + VIEW_DIRECTION[2] * distance,
    ],
    near: Math.max(0.05, distance / 200),
    far: distance * 20 + radius * 4,
  };
}
