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

/**
 * What a view asks its camera to frame. The fit itself is computed by the canvas, because it
 * depends on the canvas aspect ratio (only known once the canvas is laid out).
 */
export interface Framing {
  readonly bounds: Bounds;
  /** Never frame tighter than a sphere of this radius (tiny scenes are not over-zoomed). */
  readonly minRadius: number;
}

/**
 * A camera pose that can outlive its canvas (e.g. a split panel that is closed and reopened).
 * `fitted` is true while the camera still shows the automatic fit, i.e. the user has not
 * orbited, panned or zoomed since the last fit; only then may the view refit on resize.
 */
export interface CameraState {
  readonly position: WorldPoint;
  readonly target: WorldPoint;
  readonly fitted: boolean;
  /** Optional (additive, workstream E): projection of the saved pose; omitted = perspective. */
  readonly projection?: 'perspective' | 'orthographic' | undefined;
  /** Optional: perspective vertical field of view in degrees (kept after a camera-bus apply). */
  readonly fov?: number | undefined;
  /** Optional: orthographic visible world height in metres. */
  readonly orthoHeight?: number | undefined;
}

/** Where a canvas keeps its camera state between mounts. Plain synchronous storage, no React state. */
export interface CameraMemory {
  load(): CameraState | undefined;
  save(state: CameraState): void;
}

/** A square reference grid on the ground plane (Three.js GridHelper parameters). */
export interface GroundGrid {
  readonly center: WorldPoint;
  readonly size: number;
  readonly divisions: number;
}

/** Viewing direction (from target towards camera): front-right, above. */
const VIEW_DIRECTION: WorldPoint = normalise([1, 0.85, 1.25]);

/** Fraction of each half field of view the framed box may fill (1 / 1.15 â‰ˆ 87 %). */
export const DEFAULT_FIT_MARGIN = 1.15;

function normalise(v: readonly [number, number, number]): WorldPoint {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

const dot = (a: WorldPoint, b: WorldPoint) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: WorldPoint, b: WorldPoint): WorldPoint => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Horizontal field of view (degrees) of a perspective camera with vertical `fovDeg` and `aspect` = width / height. */
export function horizontalFov(fovDeg: number, aspect: number): number {
  return (2 * Math.atan(Math.tan(((fovDeg / 2) * Math.PI) / 180) * aspect) * 180) / Math.PI;
}

/**
 * Camera placement that frames `bounds` for a perspective camera with vertical field of view
 * `fovDeg` on a canvas of the given `aspect` (width / height). Both the vertical and the horizontal
 * field of view are respected: every corner of the box projects inside the view, with `margin`
 * to spare, so narrow (portrait) panels back the camera off and wide panels do not over-zoom out.
 * The camera looks at the box centre from a fixed front-right, elevated direction; the distance is
 * at least what a sphere of `minRadius` needs, so tiny scenes are not over-zoomed.
 */
export function fitCameraToBounds(
  bounds: Bounds,
  fovDeg: number,
  minRadius: number,
  aspect = 1,
  margin = DEFAULT_FIT_MARGIN,
): CameraFit {
  const b = bounds;
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const target: WorldPoint = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
  const radius = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2;

  const halfV = ((fovDeg / 2) * Math.PI) / 180;
  const halfH = Math.atan(Math.tan(halfV) * safeAspect);
  const tanV = Math.tan(halfV) / margin;
  const tanH = Math.tan(halfH) / margin;

  // Camera basis: `back` points from the target towards the camera; `right` and `up` span the image plane.
  const back = VIEW_DIRECTION;
  const right = normalise(cross([0, 1, 0], back));
  const up = cross(back, right);

  // Camera at target + dÂ·back. A corner with image-plane offsets (x, y) and offset z towards the
  // camera lies at depth d âˆ’ z, and is inside the view iff |x| â‰¤ (d âˆ’ z)Â·tanH and |y| â‰¤ (d âˆ’ z)Â·tanV.
  let distance = minRadius / Math.sin(Math.min(halfV, halfH));
  for (const cx of [b.min[0], b.max[0]])
    for (const cy of [b.min[1], b.max[1]])
      for (const cz of [b.min[2], b.max[2]]) {
        const o: WorldPoint = [cx - target[0], cy - target[1], cz - target[2]];
        const z = dot(o, back);
        distance = Math.max(distance, z + Math.abs(dot(o, right)) / tanH, z + Math.abs(dot(o, up)) / tanV);
      }

  return {
    target,
    position: [target[0] + back[0] * distance, target[1] + back[1] * distance, target[2] + back[2] * distance],
    near: Math.max(0.05, distance / 200),
    far: distance * 20 + radius * 4,
  };
}
