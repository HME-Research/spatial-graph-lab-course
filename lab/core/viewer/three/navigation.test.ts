import { describe, expect, it } from 'vitest';
import { cameraPoseSchema, type CameraPose, type CameraVector } from './camera';
import { convertPose, cubeDirection, distanceForHeight, isYUp, normalised, orientedPosition, orthoZoom, visibleHeight } from './navigation';

const close = (a: readonly number[], b: readonly number[], digits = 6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits));
const dist = (a: CameraVector, b: CameraVector) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('navigation cube directions (Y-up)', () => {
  it('a face click uses the face normal; an edge or corner block uses its position', () => {
    expect(cubeDirection([0, 0, 0], [0, 1, 0])).toEqual([0, 1, 0]); // Top
    expect(cubeDirection([0, 0, 0], [1, 0, 0])).toEqual([1, 0, 0]); // Right
    close(cubeDirection([0.38, 0.38, 0], null)!, [Math.SQRT1_2, Math.SQRT1_2, 0]); // edge
    close(cubeDirection([0.38, 0.38, 0.38], [0, 0, 1])!, [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)]); // corner wins over a normal
    expect(cubeDirection([0, 0, 0], null)).toBeNull();
  });

  it('keeps the distance to the target and looks from the clicked side', () => {
    const target: CameraVector = [3, 1.5, -6];
    const p = orientedPosition(target, [1, 0, 0], 20);
    close(p, [23, 1.5, -6]);
    expect(dist(p, target)).toBeCloseTo(20, 9);
  });

  it('a top view sits above the target, tilted a hair towards +Z so the orbit stays defined and north (−Z) is up on screen', () => {
    const target: CameraVector = [0, 0, 0];
    const top = orientedPosition(target, [0, 1, 0], 10);
    expect(top[1]).toBeCloseTo(10, 6);
    expect(top[0]).toBe(0);
    expect(top[2]).toBeGreaterThan(0);
    expect(top[2]).toBeLessThan(0.01);
    const bottom = orientedPosition(target, [0, -1, 0], 10);
    expect(bottom[1]).toBeCloseTo(-10, 6);
    expect(bottom[2]).toBeGreaterThan(0);
    // Valid camera pose data (position ≠ target, +Y up).
    expect(cameraPoseSchema.safeParse({ projection: 'perspective', position: top, target, up: [0, 1, 0] }).success).toBe(true);
  });

  it('a zero direction falls back to the front view instead of producing NaN', () => {
    close(orientedPosition([0, 0, 0], [0, 0, 0], 5), [0, 0, 5]);
    expect(normalised([0, 0, 0])).toBeNull();
    expect(normalised([Number.NaN, 0, 0])).toBeNull();
  });
});

describe('projection conversion', () => {
  const perspective: CameraPose = { projection: 'perspective', position: [10, 10, 10], target: [0, 0, 0], up: [0, 1, 0], fov: 45 };

  it('visibleHeight and distanceForHeight are inverses', () => {
    expect(distanceForHeight(visibleHeight(17, 45), 45)).toBeCloseTo(17, 9);
    expect(visibleHeight(1, 90)).toBeCloseTo(2, 9);
  });

  it('perspective → orthographic keeps position, target and the visible height at the target', () => {
    const ortho = convertPose(perspective, 'orthographic', 45);
    expect(ortho.projection).toBe('orthographic');
    expect(ortho.position).toEqual(perspective.position);
    expect(ortho.target).toEqual(perspective.target);
    expect(ortho.orthoHeight).toBeCloseTo(visibleHeight(Math.sqrt(300), 45), 9);
    expect(ortho.fov).toBeUndefined();
    expect(cameraPoseSchema.safeParse(ortho).success).toBe(true);
  });

  it('orthographic → perspective moves along the view line to show the same height', () => {
    const back = convertPose(convertPose(perspective, 'orthographic', 45), 'perspective', 45);
    expect(back.projection).toBe('perspective');
    close(back.position, perspective.position);
    expect(back.fov).toBe(45);
    const ortho: CameraPose = { projection: 'orthographic', position: [0, 50, 0.001], target: [0, 0, 0], up: [0, 1, 0], orthoHeight: 12 };
    const p = convertPose(ortho, 'perspective', 45);
    expect(dist(p.position, p.target)).toBeCloseTo(distanceForHeight(12, 45), 6);
    expect(p.position[1]).toBeGreaterThan(0); // still looking from above
  });

  it('a pose already in the wanted projection is returned unchanged', () => {
    expect(convertPose(perspective, 'perspective', 45)).toBe(perspective);
  });

  it('orthoZoom maps the visible height to a pixel-sized frustum', () => {
    expect(orthoZoom(600, 30)).toBe(20);
    expect(orthoZoom(0, 30)).toBe(1);
  });
});

describe('isYUp', () => {
  it('accepts only +Y up vectors', () => {
    expect(isYUp([0, 1, 0])).toBe(true);
    expect(isYUp([0, 5, 0])).toBe(true);
    expect(isYUp([0, -1, 0])).toBe(false);
    expect(isYUp([0, 0, 1])).toBe(false); // Z-up (SpatialCore / Rhino) needs the axes adapter first
    expect(isYUp([0.1, 1, 0])).toBe(false);
  });
});
