import { describe, expect, it } from 'vitest';
import { dashIntervals } from './edgeStyle';

describe('dashIntervals', () => {
  it('returns one full interval when solid', () => {
    expect(dashIntervals(3, false)).toEqual([[0, 3]]);
    expect(dashIntervals(0, true)).toEqual([]);
  });

  it('produces ordered, non-overlapping, symmetric dashes inside the segment', () => {
    const length = 3;
    const d = dashIntervals(length, true);
    expect(d.length).toBeGreaterThan(2);
    d.forEach(([a, b], i) => {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(length);
      expect(b).toBeGreaterThan(a);
      if (i > 0) expect(a).toBeGreaterThan(d[i - 1]![1]);
    });
    expect(d[0]![0]).toBeCloseTo(length - d[d.length - 1]![1]);
  });
});
