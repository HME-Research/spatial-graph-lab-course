import { describe, expect, it } from 'vitest';
import { nodesMissingHandles, type MeasuredNodeLike } from './handleRepair';

const node = (id: string, width: number | undefined, handles: boolean, hidden = false): MeasuredNodeLike => ({
  id,
  hidden,
  measured: { width, height: width },
  internals: handles ? { handleBounds: { source: [], target: [] } } : {},
});

describe('nodesMissingHandles (Graph 2D edges after a project opens, Bug B)', () => {
  it('lists nodes that are sized but have no handle bounds: the state that hid every edge', () => {
    // The reproduced sequence: measured (46, handles) → reset by a node list without `measured`
    // (no size, no handles) → the overlay restores the size only.
    const measured = [node('1', 46, true), node('2', 46, true)];
    const reset = [node('1', undefined, false), node('2', undefined, false)];
    const sizeOnly = [node('1', 46, false), node('2', 46, false)];
    expect(nodesMissingHandles(measured)).toBe('');
    expect(nodesMissingHandles(reset)).toBe('');
    expect(nodesMissingHandles(sizeOnly)).toBe('1,2');
  });

  it("leaves never-measured and hidden nodes to React Flow's own resize observer", () => {
    expect(nodesMissingHandles([node('1', undefined, false), node('2', 0, false), node('3', 46, false, true), node('4', 46, true)])).toBe('');
    expect(nodesMissingHandles([{ id: '5', internals: {} }])).toBe('');
  });

  it('is stable for the same set (a store selector re-renders only on change)', () => {
    const a = nodesMissingHandles([node('3', 46, false), node('7', 46, false)]);
    const b = nodesMissingHandles(new Map([['3', node('3', 46, false)], ['7', node('7', 46, false)]]).values());
    expect(a).toBe(b);
  });
});
