import { describe, expect, it } from 'vitest';
import { placeBubble } from './HelpTip';

/** Help bubbles are placed in the window (2026-11-24): never clipped by a pane or under a viewport. */
describe('placeBubble', () => {
  const view = { width: 1000, height: 800 };
  const trigger = (left: number, top: number) => ({ left, top, right: left + 18, bottom: top + 18, width: 18, height: 18 });

  it('centres the bubble under its trigger', () => {
    expect(placeBubble(trigger(491, 100), { width: 200, height: 60 }, view)).toEqual({ left: 400, top: 124 });
  });

  it('keeps it inside the window at both sides', () => {
    expect(placeBubble(trigger(980, 100), { width: 280, height: 60 }, view).left).toBe(1000 - 8 - 280);
    expect(placeBubble(trigger(0, 100), { width: 280, height: 60 }, view).left).toBe(8);
  });

  it('opens above when there is no room below', () => {
    expect(placeBubble(trigger(500, 760), { width: 200, height: 100 }, view).top).toBe(760 - 6 - 100);
  });
});
