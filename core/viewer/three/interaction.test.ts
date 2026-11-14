import { describe, expect, it } from 'vitest';
import { CLICK_TOLERANCE_PX, isBackgroundClick, isDeliberateObjectClick } from './interaction';

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
