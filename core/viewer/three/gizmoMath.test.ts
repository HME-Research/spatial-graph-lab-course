import { describe, expect, it } from 'vitest';
import { DEFAULT_CELL_SIZE, spatialToThree } from '../coordinates';
import {
  axisParameter,
  GIZMO_AXES,
  gridAxisCellLength,
  gridAxisDirection,
  snapHint,
  snapToSteps,
  type WorldRay,
} from './gizmoMath';

describe('grid axis directions', () => {
  it('match spatialToThree for one positive step on every axis', () => {
    const origin = spatialToThree([0, 0, 0]);
    for (const axis of GIZMO_AXES) {
      const step: [number, number, number] = [axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0];
      const moved = spatialToThree(step);
      const dir = gridAxisDirection(axis);
      const len = gridAxisCellLength(axis, DEFAULT_CELL_SIZE);
      expect([moved[0] - origin[0], moved[1] - origin[1], moved[2] - origin[2]]).toEqual(dir.map((d) => d * len + 0));
    }
  });

  it('uses the app cell size, not a hard-coded 3 m', () => {
    const cell = { horizontal: 4, vertical: 2.5 };
    expect(gridAxisCellLength('x', cell)).toBe(4);
    expect(gridAxisCellLength('y', cell)).toBe(4);
    expect(gridAxisCellLength('z', cell)).toBe(2.5);
  });
});

describe('axisParameter', () => {
  it('finds the axis point under a perpendicular ray', () => {
    // Axis: world X through the origin. Ray straight down at x = 7.
    const ray: WorldRay = { origin: [7, 10, 0], direction: [0, -1, 0] };
    expect(axisParameter(ray, [0, 0, 0], [1, 0, 0])).toBeCloseTo(7);
  });

  it('handles oblique rays and offset origins', () => {
    const ray: WorldRay = { origin: [0, 5, 5], direction: [0.2, -1, -1] };
    // Closest point on the vertical line x = 1, z = 0 (world Y axis offset).
    const t = axisParameter(ray, [1, 0, 0], [0, 1, 0]);
    expect(t).not.toBeNull();
    // Ray reaches z = 0 at s = 5 → point (1, 0, 0): t = 0.
    expect(t!).toBeCloseTo(0);
  });

  it('returns null for a ray parallel to the axis', () => {
    expect(axisParameter({ origin: [0, 0, 5], direction: [1, 0, 0] }, [0, 0, 0], [1, 0, 0])).toBeNull();
    expect(axisParameter({ origin: [0, 0, 5], direction: [0, 0, 0] }, [0, 0, 0], [1, 0, 0])).toBeNull();
  });
});

describe('snapToSteps', () => {
  it('converts a world delta to whole cells (nearest)', () => {
    expect(snapToSteps(0, 3)).toBe(0);
    expect(snapToSteps(1.4, 3)).toBe(0);
    expect(snapToSteps(1.6, 3)).toBe(1);
    expect(snapToSteps(7.4, 3)).toBe(2);
    expect(snapToSteps(-4.6, 3)).toBe(-2);
  });

  it('never returns -0 and is a no-op for degenerate input', () => {
    expect(Object.is(snapToSteps(-0.2, 3), 0)).toBe(true);
    expect(snapToSteps(5, 0)).toBe(0);
    expect(snapToSteps(Number.NaN, 3)).toBe(0);
  });
});

it('describes the snap increment from the cell size', () => {
  expect(snapHint(DEFAULT_CELL_SIZE)).toBe('Snaps to 3 m grid');
  expect(snapHint({ horizontal: 3, vertical: 3.5 })).toBe('Snaps to 3 m × 3.5 m grid');
});
