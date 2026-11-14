import { describe, expect, it } from 'vitest';
import { fitCameraToBounds, type Bounds } from './viewport';

describe('fitCameraToBounds', () => {
  const box: Bounds = { min: [-2, 0, -1], max: [4, 6, 1] };

  it('targets the box centre and stays far enough to see the bounding sphere', () => {
    const fov = 45;
    const fit = fitCameraToBounds(box, fov, 0);
    expect(fit.target).toEqual([1, 3, 0]);
    const d = Math.hypot(...fit.position.map((p, i) => p - fit.target[i]!));
    const radius = Math.hypot(6, 6, 2) / 2;
    expect(d * Math.sin(((fov / 2) * Math.PI) / 180)).toBeGreaterThanOrEqual(radius);
    expect(fit.position[1]).toBeGreaterThan(fit.target[1]); // looking down
    expect(fit.near).toBeGreaterThan(0);
    expect(fit.far).toBeGreaterThan(d + radius);
  });

  it('never frames tighter than minRadius', () => {
    const point: Bounds = { min: [1, 2, 3], max: [1, 2, 3] };
    const fit = fitCameraToBounds(point, 60, 3);
    expect(fit.target).toEqual([1, 2, 3]);
    const d = Math.hypot(...fit.position.map((p, i) => p - fit.target[i]!));
    expect(d).toBeCloseTo((3 / Math.sin(Math.PI / 6)) * 1.25); // radius 3 at a 60° field of view
  });
});
