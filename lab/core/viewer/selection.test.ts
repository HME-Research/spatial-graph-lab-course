import { describe, expect, it } from 'vitest';
import {
  addToSelection,
  isEdgeSelected,
  isNodeSelected,
  NO_SELECTION,
  reconcileSelection,
  sameSelection,
  selectedEdgeIds,
  selectedNodeIds,
  selectEdge,
  selectionEmphasis,
  selectItems,
  selectNode,
  toggleSelected,
} from './selection';

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

describe('multi-selection (2026-11-23)', () => {
  it('selectItems normalises: nothing, one node / edge, or a sorted multi without repeats', () => {
    expect(selectItems([], [])).toEqual(NO_SELECTION);
    expect(selectItems([3], [])).toEqual(selectNode(3));
    expect(selectItems([], [2])).toEqual(selectEdge(2));
    expect(selectItems([3, 1, 3], [2])).toEqual({ kind: 'multi', nodes: [1, 3], edges: [2] });
  });

  it('Ctrl-click toggles an item; removing down to one item gives a single selection again', () => {
    let s = toggleSelected(selectNode(1), 'node', 2);
    expect(s).toEqual({ kind: 'multi', nodes: [1, 2], edges: [] });
    s = toggleSelected(s, 'edge', 1);
    expect([selectedNodeIds(s), selectedEdgeIds(s)]).toEqual([[1, 2], [1]]);
    s = toggleSelected(toggleSelected(s, 'node', 1), 'edge', 1);
    expect(s).toEqual(selectNode(2));
    expect(toggleSelected(s, 'node', 2)).toEqual(NO_SELECTION);
  });

  it('addToSelection merges a box result into the current selection', () => {
    expect(addToSelection(selectNode(1), [1, 3], [2])).toEqual({ kind: 'multi', nodes: [1, 3], edges: [2] });
  });

  it('membership, equality and emphasis cover every selected item', () => {
    const s = selectItems([1], [2]);
    expect(isNodeSelected(s, 1) && isEdgeSelected(s, 2)).toBe(true);
    expect(isNodeSelected(s, 3) || isEdgeSelected(s, 1)).toBe(false);
    expect(sameSelection(s, selectItems([1], [2]))).toBe(true);
    expect(sameSelection(s, selectItems([1, 2], [2]))).toBe(false);
    const e = selectionEmphasis(s, edges);
    expect([...e.primaryNodes]).toEqual([1]);
    expect([...e.edges]).toEqual([2]);
    // Edge 2's other end (node 3) is not selected, so it is not highlighted either.
    expect(e.secondaryNodes.size).toBe(0);
    expect(selectionEmphasis(selectItems([], [1, 2]), edges).primaryNodes.size).toBe(0);
  });

  it('reconcile keeps the items that still exist and returns the same object when nothing changed', () => {
    const s = selectItems([1, 2], [1]);
    const items = { nodes: [{ id: 1 }, { id: 2 }], edges: [{ id: 1 }] };
    expect(reconcileSelection(s, items)).toBe(s);
    expect(reconcileSelection(s, { nodes: [{ id: 2 }], edges: [{ id: 1 }] })).toEqual({ kind: 'multi', nodes: [2], edges: [1] });
    expect(reconcileSelection(s, { nodes: [{ id: 2 }], edges: [] })).toEqual(selectNode(2));
  });
});
