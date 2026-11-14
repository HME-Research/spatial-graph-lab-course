import { describe, expect, it } from 'vitest';
import { NO_SELECTION, selectEdge, selectionEmphasis, selectNode } from './selection';

// Same topology as the three-rooms fixture: edges a–b and a–c.
const edges = [
  { id: 'ab', source: 'a', target: 'b' },
  { id: 'ac', source: 'a', target: 'c' },
] as const;

describe('selectionEmphasis', () => {
  it('highlights a selected node only', () => {
    const e = selectionEmphasis(selectNode('a'), edges);
    expect([...e.primaryNodes]).toEqual(['a']);
    expect(e.secondaryNodes.size + e.edges.size).toBe(0);
  });

  it('highlights a selected edge and softly its endpoints', () => {
    const e = selectionEmphasis(selectEdge('ac'), edges);
    expect([...e.edges]).toEqual(['ac']);
    expect([...e.secondaryNodes].sort()).toEqual(['a', 'c']);
    expect(e.primaryNodes.size).toBe(0);
  });

  it('highlights nothing for no selection or an unknown edge', () => {
    for (const sel of [NO_SELECTION, selectEdge('nope')]) {
      const e = selectionEmphasis(sel, edges);
      expect(e.primaryNodes.size + e.secondaryNodes.size + e.edges.size).toBe(0);
    }
  });
});
