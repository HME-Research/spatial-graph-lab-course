import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FloatingWindow } from './FloatingWindow';
import {
  MINIMISED_HEIGHT,
  NUDGE,
  bringToFront,
  clampPosition,
  clampSize,
  defaultState,
  fitState,
  sizedWindowId,
  nudgeFor,
  parseWindowState,
  readWindowState,
  storageKey,
  windowKeyAction,
  writeWindowState,
  type StorageLike,
} from './windowState';

const vp = { width: 1000, height: 700 };
const min = { width: 260, height: 160 };

describe('floating window geometry', () => {
  it('keeps the window inside the viewport while dragging', () => {
    const outer = { width: 400, height: 300 };
    expect(clampPosition({ x: -50, y: -20 }, outer, vp)).toEqual({ x: 0, y: 0 });
    expect(clampPosition({ x: 900, y: 650 }, outer, vp)).toEqual({ x: 600, y: 400 });
    expect(clampPosition({ x: 100, y: 100 }, outer, vp)).toEqual({ x: 100, y: 100 });
  });
  it('limits size to minSize and the viewport', () => {
    expect(clampSize({ width: 10, height: 10 }, min, vp)).toEqual(min);
    expect(clampSize({ width: 5000, height: 5000 }, min, vp)).toEqual(vp);
    expect(clampSize({ width: 500, height: 300 }, min, vp)).toEqual({ width: 500, height: 300 });
  });
  it('fits a stored state to a smaller viewport, using the bar height when minimised', () => {
    const s = fitState({ x: 900, y: 690, width: 400, height: 300, minimised: true }, min, vp);
    expect(s).toEqual({ x: 600, y: vp.height - MINIMISED_HEIGHT, width: 400, height: 300, minimised: true });
    const t = fitState({ x: 0, y: 0, width: 4000, height: 4000, minimised: false }, min, { width: 500, height: 400 });
    expect(t).toMatchObject({ width: 500, height: 400, x: 0, y: 0 });
  });
  it('default state is inside the viewport', () => {
    const s = defaultState({ width: 420, height: 480 }, min, vp);
    expect(s.x + s.width).toBeLessThanOrEqual(vp.width);
    expect(s.y + s.height).toBeLessThanOrEqual(vp.height);
    expect(s.minimised).toBe(false);
  });
  it('default state is centred in the viewport', () => {
    const s = defaultState({ width: 420, height: 480 }, min, { width: 1200, height: 800 });
    expect(s).toMatchObject({ x: 390, y: 160, width: 420, height: 480 });
  });
  it('arrow keys nudge, Shift nudges further, other keys do nothing', () => {
    expect(nudgeFor('ArrowLeft', false)).toEqual({ x: -NUDGE, y: 0 });
    expect(nudgeFor('ArrowDown', true)).toEqual({ x: 0, y: NUDGE * 5 });
    expect(nudgeFor('a', false)).toBeNull();
  });
  it('brings the focused window to the front', () => {
    expect(bringToFront(['a', 'b', 'c'], 'a')).toEqual(['b', 'c', 'a']);
    expect(bringToFront(['a'], 'z')).toEqual(['a', 'z']);
  });
  it('Escape closes unless already handled', () => {
    expect(windowKeyAction('Escape', false)).toBe('close');
    expect(windowKeyAction('Escape', true)).toBeNull();
    expect(windowKeyAction('Enter', false)).toBeNull();
  });
});

describe('remembered state', () => {
  const good = { x: 10, y: 20, width: 300, height: 200, minimised: true };
  it('parses valid state and rejects malformed state', () => {
    expect(parseWindowState(JSON.stringify(good))).toEqual(good);
    for (const bad of [null, undefined, '', 'nope', '[]', '{}', JSON.stringify({ ...good, x: 'a' }), JSON.stringify({ ...good, minimised: 1 }), JSON.stringify({ ...good, width: null })]) {
      expect(parseWindowState(bad)).toBeNull();
    }
  });
  it('a sized id carries the opening size, so a new size is not hidden by an older remembered state', () => {
    expect(sizedWindowId('guide', { width: 720, height: 640 })).toBe('guide@720x640');
    expect(sizedWindowId('explainer-degree', { width: 520, height: 480 })).not.toBe(sizedWindowId('explainer-degree', { width: 360, height: 300 }));
  });
  it('round-trips per id', () => {
    const data = new Map<string, string>();
    const store: StorageLike = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
    writeWindowState('guide', good, store);
    expect(data.has(storageKey('guide'))).toBe(true);
    expect(readWindowState('guide', store)).toEqual(good);
    expect(readWindowState('other', store)).toBeNull();
  });
  it('survives unavailable or throwing storage', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(readWindowState('guide', broken)).toBeNull();
    expect(() => writeWindowState('guide', good, broken)).not.toThrow();
    expect(readWindowState('guide', null)).toBeNull();
    expect(() => writeWindowState('guide', good, null)).not.toThrow();
  });
});

describe('FloatingWindow rendering', () => {
  it('renders title, labelled controls and content; nothing when closed', () => {
    const html = renderToStaticMarkup(createElement(FloatingWindow, { id: 't', title: 'Demo', open: true, onClose: () => undefined }, createElement('p', null, 'inside')));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="false"');
    expect(html).toContain('aria-label="Minimise Demo"');
    expect(html).toContain('aria-label="Close Demo"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('inside');
    expect(renderToStaticMarkup(createElement(FloatingWindow, { id: 't', title: 'Demo', open: false, onClose: () => undefined }))).toBe('');
  });
});
