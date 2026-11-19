import { describe, expect, it } from 'vitest';
import { NO_SELECTION, selectEdge, selectionEmphasis, selectNode } from './selection';

// Same topology as the three-rooms fixture (a=1, b=2, c=3): edges 1 (1–2) and 2 (1–3).
const edges = [
  { id: 1, source: 1, target: 2 },
  { id: 2, source: 1, target: 3 },
] as const;

describe('selectionEmphasis', () => {
  it('highlights a selected node only', () => {
    const e = selectionEmphasis(selectNode(1), edges);
    expect([...e.primaryNodes]).toEqual([1]);
    expect(e.secondaryNodes.size + e.edges.size).toBe(0);
  });

  it('highlights a selected edge and softly its endpoints', () => {
    const e = selectionEmphasis(selectEdge(2), edges);
    expect([...e.edges]).toEqual([2]);
    expect([...e.secondaryNodes].sort((x, y) => x - y)).toEqual([1, 3]);
    expect(e.primaryNodes.size).toBe(0);
  });

  it('highlights nothing for no selection or an unknown edge', () => {
    for (const sel of [NO_SELECTION, selectEdge(99)]) {
      const e = selectionEmphasis(sel, edges);
      expect(e.primaryNodes.size + e.secondaryNodes.size + e.edges.size).toBe(0);
    }
  });
});
