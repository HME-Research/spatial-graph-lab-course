import { describe, expect, it } from 'vitest';
import { placeBeside } from './panelPlacement';

describe('placeBeside (wall panel next to the clicked wall)', () => {
  const panel = { width: 250, height: 160 };
  const view = { width: 1000, height: 600 };

  it('sits to the right of the point, vertically centred on it', () => {
    expect(placeBeside({ x: 300, y: 300 }, panel, view)).toEqual({ left: 316, top: 220 });
  });

  it('flips to the left near the right edge', () => {
    expect(placeBeside({ x: 900, y: 300 }, panel, view)).toEqual({ left: 900 - 16 - 250, top: 220 });
  });

  it('always stays inside the view, also near the top and bottom or in a small view', () => {
    expect(placeBeside({ x: 300, y: 10 }, panel, view).top).toBe(8);
    expect(placeBeside({ x: 300, y: 595 }, panel, view).top).toBe(600 - 160 - 8);
    const tiny = placeBeside({ x: 50, y: 50 }, panel, { width: 200, height: 100 });
    expect(tiny.left).toBe(8);
    expect(tiny.top).toBe(8);
  });
});
