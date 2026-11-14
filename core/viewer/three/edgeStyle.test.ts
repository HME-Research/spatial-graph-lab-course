import { describe, expect, it } from 'vitest';
import { EDGE_KINDS, isVerticalKind } from '../../graph';
import { SELECTION_COLOR } from '../appearance';
import { dashIntervals, EDGE_LEGEND_ORDER, EDGE_STYLES, HORIZONTAL_EDGE_COLOR, VERTICAL_EDGE_COLOR } from './edgeStyle';
import { CLICK_TOLERANCE_PX, isBackgroundClick, isDeliberateObjectClick } from './interaction';

describe('edge styles', () => {
  it('distinguish vertical from horizontal kinds by colour, and kinds within a family by dash', () => {
    for (const k of EDGE_KINDS) {
      expect(EDGE_STYLES[k].color).toBe(isVerticalKind(k) ? VERTICAL_EDGE_COLOR : HORIZONTAL_EDGE_COLOR);
      expect(EDGE_STYLES[k].color).not.toBe(SELECTION_COLOR);
    }
    expect(EDGE_STYLES.door.dashed).not.toBe(EDGE_STYLES.open.dashed);
    expect(EDGE_STYLES.atrium.dashed).not.toBe(EDGE_STYLES['vertical-access'].dashed);
    expect([...EDGE_LEGEND_ORDER].sort()).toEqual([...EDGE_KINDS].sort());
    expect(EDGE_LEGEND_ORDER.slice(0, 2).every((k) => !isVerticalKind(k))).toBe(true);
  });
});

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

describe('click vs drag', () => {
  const click = { type: 'click', button: 0 };
  it('accepts a primary click with negligible movement only', () => {
    expect(isDeliberateObjectClick(0, click)).toBe(true);
    expect(isDeliberateObjectClick(CLICK_TOLERANCE_PX, click)).toBe(true);
    expect(isDeliberateObjectClick(CLICK_TOLERANCE_PX + 1, click)).toBe(false); // orbit drag ending on an object
    expect(isDeliberateObjectClick(0, { type: 'click', button: 2 })).toBe(false);
    expect(isDeliberateObjectClick(0, { type: 'contextmenu', button: 2 })).toBe(false);
  });

  it('clears on a primary background click, not on right-click (pan)', () => {
    expect(isBackgroundClick(click)).toBe(true);
    expect(isBackgroundClick({ type: 'contextmenu', button: 2 })).toBe(false);
    expect(isBackgroundClick({ type: 'dblclick', button: 0 })).toBe(false);
  });
});
