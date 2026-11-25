import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_FIT_MARGIN, fitCameraToBounds, horizontalFov, type Bounds, type CameraFit } from './viewport';

const corners = (b: Bounds) =>
  [b.min[0], b.max[0]].flatMap((x) => [b.min[1], b.max[1]].flatMap((y) => [b.min[2], b.max[2]].map((z) => new Vector3(x, y, z))));

/** Normalised device coordinates of every box corner seen through a real Three.js camera placed at `fit`. */
function project(fit: CameraFit, b: Bounds, fov: number, aspect: number) {
  const camera = new PerspectiveCamera(fov, aspect, fit.near, fit.far);
  camera.position.set(...fit.position);
  camera.lookAt(new Vector3(...fit.target));
  camera.updateMatrixWorld();
  return corners(b).map((c) => c.clone().project(camera));
}

const distanceOf = (fit: CameraFit) => Math.hypot(...fit.position.map((p, i) => p - fit.target[i]!));

describe('fitCameraToBounds', () => {
  const box: Bounds = { min: [-2, 0, -1], max: [4, 6, 1] };
  // A wide, low building (3 × 1 cells, 1 storey) and a tall, narrow tower stress opposite axes.
  const wide: Bounds = { min: [-1.5, 0, -1.5], max: [25.5, 3, 1.5] };
  const tower: Bounds = { min: [-1.5, 0, -1.5], max: [1.5, 30, 1.5] };
  const ASPECTS = [0.3, 0.5, 0.75, 1, 1.5, 2.4, 4];

  it('targets the box centre and looks down at it', () => {
    const fit = fitCameraToBounds(box, 45, 0);
    expect(fit.target).toEqual([1, 3, 0]);
    expect(fit.position[1]).toBeGreaterThan(fit.target[1]);
    expect(fit.near).toBeGreaterThan(0);
    expect(fit.far).toBeGreaterThan(distanceOf(fit) + Math.hypot(6, 6, 2) / 2);
  });

  it.each(ASPECTS)('keeps every corner inside both the horizontal and vertical field of view at aspect %s', (aspect) => {
    for (const b of [box, wide, tower]) {
      const fit = fitCameraToBounds(b, 45, 0, aspect);
      for (const p of project(fit, b, 45, aspect)) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(1 / DEFAULT_FIT_MARGIN + 1e-9);
        expect(Math.abs(p.y)).toBeLessThanOrEqual(1 / DEFAULT_FIT_MARGIN + 1e-9);
        expect(p.z).toBeGreaterThan(-1); // in front of the near plane
        expect(p.z).toBeLessThan(1); // before the far plane
      }
    }
  });

  it.each(ASPECTS)('is tight: the box touches the margin on at least one axis at aspect %s', (aspect) => {
    for (const b of [box, wide, tower]) {
      const fit = fitCameraToBounds(b, 45, 0, aspect);
      const extent = Math.max(...project(fit, b, 45, aspect).flatMap((p) => [Math.abs(p.x), Math.abs(p.y)]));
      expect(extent).toBeCloseTo(1 / DEFAULT_FIT_MARGIN, 6);
    }
  });

  it('backs off for narrow panels and comes closer for wide ones', () => {
    const d = ASPECTS.map((a) => distanceOf(fitCameraToBounds(wide, 45, 0, a)));
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeLessThanOrEqual(d[i - 1]!);
    expect(d[0]).toBeGreaterThan(d[d.length - 1]! * 2);
  });

  it('a tall model in a wide panel is limited by the vertical field of view', () => {
    const narrow = distanceOf(fitCameraToBounds(tower, 45, 0, 1));
    const wider = distanceOf(fitCameraToBounds(tower, 45, 0, 3));
    expect(wider).toBeCloseTo(narrow, 6); // already vertically limited at aspect 1
  });

  it('never frames tighter than minRadius', () => {
    const point: Bounds = { min: [1, 2, 3], max: [1, 2, 3] };
    const fit = fitCameraToBounds(point, 60, 3);
    expect(fit.target).toEqual([1, 2, 3]);
    expect(distanceOf(fit)).toBeCloseTo(3 / Math.sin(Math.PI / 6)); // radius 3 at a 60° field of view
    // In a portrait panel the narrower horizontal field of view governs.
    const portrait = fitCameraToBounds(point, 60, 3, 0.5);
    expect(distanceOf(portrait)).toBeCloseTo(3 / Math.sin(((horizontalFov(60, 0.5) / 2) * Math.PI) / 180));
  });

  it('treats an invalid aspect (zero-size canvas) as square', () => {
    expect(fitCameraToBounds(box, 45, 0, 0)).toEqual(fitCameraToBounds(box, 45, 0, 1));
    expect(fitCameraToBounds(box, 45, 0, Number.NaN)).toEqual(fitCameraToBounds(box, 45, 0, 1));
  });

  it('horizontalFov matches the vertical field of view at aspect 1 and widens with the aspect', () => {
    expect(horizontalFov(45, 1)).toBeCloseTo(45);
    expect(horizontalFov(45, 2)).toBeGreaterThan(45);
    expect(horizontalFov(45, 0.5)).toBeLessThan(45);
  });
});
