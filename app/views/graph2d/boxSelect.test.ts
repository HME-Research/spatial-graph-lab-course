import { describe, expect, it } from 'vitest';
import { boxFromDrag, boxSelect, type BoxItems } from './boxSelect';

// Three circles (radius 20) in a row at x = 0, 100, 200; relationships 1 (1–2) and 2 (2–3).
const items: BoxItems = {
  nodes: [
    { id: 1, circle: { centre: [0, 0], radius: 20 } },
    { id: 2, circle: { centre: [100, 0], radius: 20 } },
    { id: 3, circle: { centre: [200, 0], radius: 20 } },
  ],
  edges: [
    { id: 1, source: 1, target: 2 },
    { id: 2, source: 2, target: 3 },
  ],
};
const both = { nodes: true, edges: true };

describe('boxFromDrag', () => {
  it('left → right is a window, right → left a crossing; the box is normalised', () => {
    expect(boxFromDrag({ x: 0, y: 10 }, { x: 50, y: -10 })).toEqual({ box: { minX: 0, minY: -10, maxX: 50, maxY: 10 }, mode: 'window' });
    expect(boxFromDrag({ x: 50, y: 0 }, { x: 0, y: 10 }).mode).toBe('crossing');
  });
});

describe('boxSelect', () => {
  it('window: only items entirely inside (a relationship needs both of its drawn ends inside)', () => {
    // Covers circles 1 and 2 fully and only part of relationship 2 (drawn from x = 120 to 180).
    const box = { minX: -30, minY: -30, maxX: 170, maxY: 30 };
    expect(boxSelect(items, box, 'window', both)).toEqual({ nodes: [1, 2], edges: [1] });
  });

  it('crossing: everything the box touches', () => {
    // A thin box between circles 2 and 3 touches only relationship 2 …
    expect(boxSelect(items, { minX: 140, minY: -5, maxX: 160, maxY: 5 }, 'crossing', both)).toEqual({ nodes: [], edges: [2] });
    // … and one reaching into the border of circle 3 also touches that circle.
    expect(boxSelect(items, { minX: 140, minY: -5, maxX: 185, maxY: 5 }, 'crossing', both)).toEqual({ nodes: [3], edges: [2] });
  });

  it('crossing does not select a relationship the box passes beside', () => {
    expect(boxSelect(items, { minX: 140, minY: 10, maxX: 160, maxY: 40 }, 'crossing', both)).toEqual({ nodes: [], edges: [] });
  });

  it('the filter limits the result to nodes or relationships', () => {
    const box = { minX: -30, minY: -30, maxX: 230, maxY: 30 };
    expect(boxSelect(items, box, 'window', { nodes: true, edges: false })).toEqual({ nodes: [1, 2, 3], edges: [] });
    expect(boxSelect(items, box, 'window', { nodes: false, edges: true })).toEqual({ nodes: [], edges: [1, 2] });
  });
});
