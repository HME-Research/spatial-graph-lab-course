import type { CameraPose, CameraProjection, CameraVector } from './camera';

/**
 * Pure camera navigation helpers for `SceneCanvas` (workstream E). No React, no Three.js.
 *
 * Everything is in the Three.js **Y-up** world (`spatialToThree`): +Y is up, +X is grid +x and
 * +Z is grid −y. The navigation cube therefore labels +Y "Top", +X "Right" and +Z "Front"
 * (Three.js `BoxGeometry` face order), which matches the building's storeys stacking upwards.
 */

export const Y_UP: CameraVector = [0, 1, 0];

/** Distance (fraction of the view distance) a top/bottom view is tilted off the vertical. */
const VERTICAL_TILT = 1e-4;
const EPSILON = 1e-9;

const length = (v: CameraVector): number => Math.hypot(v[0], v[1], v[2]);
const sub = (a: CameraVector, b: CameraVector): CameraVector => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: CameraVector, b: CameraVector): CameraVector => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (v: CameraVector, s: number): CameraVector => [v[0] * s, v[1] * s, v[2] * s];

/** `v` scaled to length 1, or null for a zero / non-finite vector. */
export function normalised(v: CameraVector): CameraVector | null {
  const l = length(v);
  if (!Number.isFinite(l) || l < EPSILON) return null;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/**
 * Camera position that looks at `target` from `direction` (pointing from the target towards the
 * camera) at `distance`. A straight top or bottom view is tilted by a tiny amount towards +Z, so the
 * orbit controls (which orbit around +Y) stay well-defined and the screen's up points to −Z
 * (grid +y, "north") in a top view.
 */
export function orientedPosition(target: CameraVector, direction: CameraVector, distance: number): CameraVector {
  const d = normalised(direction) ?? ([0, 0, 1] as CameraVector);
  const vertical = Math.abs(d[0]) < EPSILON && Math.abs(d[2]) < EPSILON;
  const tilted = vertical ? (normalised([0, d[1], VERTICAL_TILT]) as CameraVector) : d;
  return add(target, scale(tilted, Math.max(distance, EPSILON)));
}

/**
 * The navigation-cube click → the direction to look from. `objectPosition` is the clicked part's
 * position in the cube's frame (an edge or corner block sits off-centre); for the central face cube
 * it is the origin and the clicked `faceNormal` gives the direction. Returns null when neither
 * gives a direction.
 */
export function cubeDirection(objectPosition: CameraVector, faceNormal: CameraVector | null): CameraVector | null {
  return normalised(objectPosition) ?? (faceNormal ? normalised(faceNormal) : null);
}

/** Visible world height at `distance` of a perspective camera with vertical field of view `fovDeg`. */
export function visibleHeight(distance: number, fovDeg: number): number {
  return 2 * distance * Math.tan(((fovDeg / 2) * Math.PI) / 180);
}

/** Inverse of `visibleHeight`: the perspective distance that shows `height` world units. */
export function distanceForHeight(height: number, fovDeg: number): number {
  return height / (2 * Math.tan(((fovDeg / 2) * Math.PI) / 180));
}

/**
 * The same view in the other projection, keeping position direction, target and up:
 * - perspective → orthographic: the orthographic height is what the perspective camera showed at
 *   the target's distance (so the model keeps its on-screen size at the target);
 * - orthographic → perspective: the camera moves along its view line to the distance at which the
 *   perspective camera (field of view `fov`) shows that height.
 * A pose already in `to` is returned unchanged.
 */
export function convertPose(pose: CameraPose, to: CameraProjection, defaultFov: number): CameraPose {
  if (pose.projection === to) return pose;
  const offset = sub(pose.position, pose.target);
  const distance = length(offset);
  const direction = normalised(offset) ?? ([0, 0, 1] as CameraVector);
  if (to === 'orthographic') {
    const fov = pose.fov ?? defaultFov;
    return { projection: 'orthographic', position: pose.position, target: pose.target, up: pose.up, orthoHeight: Math.max(visibleHeight(distance, fov), EPSILON) };
  }
  const height = pose.orthoHeight ?? visibleHeight(distance, defaultFov);
  return {
    projection: 'perspective',
    position: add(pose.target, scale(direction, Math.max(distanceForHeight(height, defaultFov), EPSILON))),
    target: pose.target,
    up: pose.up,
    fov: defaultFov,
  };
}

/** Orthographic camera zoom (Three.js `OrthographicCamera.zoom` with a pixel-sized frustum) that shows `orthoHeight` on a canvas `pixelHeight` tall. */
export function orthoZoom(pixelHeight: number, orthoHeight: number): number {
  return pixelHeight > 0 && orthoHeight > 0 ? pixelHeight / orthoHeight : 1;
}

/** True when `up` points along +Y: the only up vector the orbit controls support. */
export function isYUp(up: CameraVector, tolerance = 1e-6): boolean {
  const l = length(up);
  return l > 0 && up[1] > 0 && Math.abs(up[0] / l) < tolerance && Math.abs(up[2] / l) < tolerance;
}
