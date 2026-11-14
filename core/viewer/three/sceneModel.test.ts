import { describe, expect, it } from 'vitest';
import type { DesignDocument, GraphEdge, GraphNode } from '../../graph';
import { threeRooms } from '../../graph/test-fixtures';
import { DEFAULT_CELL_SIZE, spatialToThree } from '../coordinates';
import { NO_SELECTION, selectEdge, selectNode } from '../selection';
import {
  accessGroups,
  buildEdgeItems,
  buildNodeItems,
  cellBounds,
  fitCamera,
  groundGrid,
  selectionEmphasis,
  storeyLevels,
} from './sceneModel';

const node = (id: string, grid: [number, number, number], typeId = 'room'): GraphNode => ({
  id,
  grid,
  typeId,
  attributes: {},
});
const edge = (id: string, source: string, target: string, kind: GraphEdge['kind'] = 'door'): GraphEdge => ({
  id,
  source,
  target,
  kind,
  attributes: {},
});

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('buildNodeItems / buildEdgeItems', () => {
  it('places nodes at spatialToThree cell centres with their storey as level', () => {
    const doc = threeRooms();
    const items = buildNodeItems(doc.nodes);
    expect(items.map((n) => [n.id, n.position, n.level])).toEqual([
      ['a', spatialToThree([0, 0, 0]), 0],
      ['b', spatialToThree([1, 0, 0]), 0],
      ['c', spatialToThree([0, 0, 1]), 1],
    ]);
  });

  it('draws edges centre to centre and classifies horizontal vs vertical kinds', () => {
    const items = buildEdgeItems(threeRooms().nodes, threeRooms().edges);
    const ab = items.find((e) => e.id === 'ab')!;
    const ac = items.find((e) => e.id === 'ac')!;
    expect(ab).toMatchObject({ vertical: false, start: [0, 1.5, 0], end: [3, 1.5, 0], length: 3, direction: [1, 0, 0] });
    expect(ab.mid).toEqual([1.5, 1.5, 0]);
    expect(ac).toMatchObject({ vertical: true, start: [0, 1.5, 0], end: [0, 4.5, 0], length: 3, direction: [0, 1, 0] });
  });

  it('skips edges whose endpoint is missing instead of throwing', () => {
    const items = buildEdgeItems([node('a', [0, 0, 0])], [edge('x', 'a', 'ghost')]);
    expect(items).toEqual([]);
  });

  it('ignores diagram positions and never mutates the document', () => {
    const doc = deepFreeze(threeRooms());
    const moved: DesignDocument = { ...doc, diagram: { positions: { a: [999, -999], b: [0, 0], c: [5, 5] } } };
    expect(buildNodeItems(moved.nodes)).toEqual(buildNodeItems(doc.nodes));
    expect(buildEdgeItems(moved.nodes, moved.edges)).toEqual(buildEdgeItems(doc.nodes, doc.edges));
    // deepFreeze would make any mutation throw in strict-mode modules.
    expect(() => {
      cellBounds(doc.nodes);
      groundGrid(doc.nodes);
      accessGroups(doc.nodes, doc.edges);
      storeyLevels(doc.nodes);
    }).not.toThrow();
  });
});

describe('storeyLevels and bounds', () => {
  it('lists distinct storeys ascending, including basements', () => {
    expect(storeyLevels([node('a', [0, 0, 2]), node('b', [0, 0, -1]), node('c', [1, 0, 2])])).toEqual([-1, 2]);
  });

  it('cellBounds covers full cell extents, and is null for an empty document', () => {
    expect(cellBounds([])).toBeNull();
    expect(cellBounds(threeRooms().nodes)).toEqual({ min: [-1.5, 0, -1.5], max: [4.5, 6, 1.5] });
  });
});

describe('fitCamera', () => {
  it('targets the bounds centre and stays far enough to see the bounding sphere', () => {
    const bounds = cellBounds(threeRooms().nodes)!;
    const fov = 45;
    const fit = fitCamera(bounds, fov);
    expect(fit.target).toEqual([1.5, 3, 0]);
    const d = Math.hypot(...fit.position.map((p, i) => p - fit.target[i]!));
    const radius = Math.hypot(6, 6, 3) / 2;
    expect(d * Math.sin(((fov / 2) * Math.PI) / 180)).toBeGreaterThanOrEqual(radius);
    expect(fit.position[1]).toBeGreaterThan(fit.target[1]); // looking down onto the building
    expect(fit.near).toBeGreaterThan(0);
    expect(fit.far).toBeGreaterThan(d + radius);
  });

  it('frames a sensible default for an empty document', () => {
    const fit = fitCamera(null, 45);
    expect(fit.target).toEqual([0, DEFAULT_CELL_SIZE.vertical / 2, 0]);
    expect(fit.position.every(Number.isFinite)).toBe(true);
  });

  it('frames widely separated groups together', () => {
    const nodes = [node('a', [0, 0, 0]), node('b', [40, -30, 3])];
    const fit = fitCamera(cellBounds(nodes), 45);
    const a = spatialToThree([0, 0, 0]);
    const b = spatialToThree([40, -30, 3]);
    expect(fit.target).toEqual([(a[0] + b[0]) / 2, (0 + 4 * 3) / 2, (a[2] + b[2]) / 2]);
  });
});

describe('groundGrid', () => {
  it('aligns lines with cell boundaries and covers every cell plus margin', () => {
    const nodes = [node('a', [0, 0, 0]), node('b', [3, 0, 0]), node('c', [-2, 5, 1])];
    const g = groundGrid(nodes, DEFAULT_CELL_SIZE, 2);
    const h = DEFAULT_CELL_SIZE.horizontal;
    expect(g.divisions % 2).toBe(0);
    expect(g.size).toBe(g.divisions * h);
    expect(g.center[1]).toBe(0);
    // Centre sits on a cell boundary: (X / h) is a half-integer.
    expect(Math.abs(((g.center[0] / h) % 1) + 0)).toBeCloseTo(0.5);
    expect(Math.abs(((g.center[2] / h) % 1) + 0)).toBeCloseTo(0.5);
    for (const n of nodes) {
      const [x, , z] = spatialToThree(n.grid);
      expect(Math.abs(x - g.center[0]) + h / 2 + 2 * h).toBeLessThanOrEqual(g.size / 2);
      expect(Math.abs(z - g.center[2]) + h / 2 + 2 * h).toBeLessThanOrEqual(g.size / 2);
    }
  });
});

describe('accessGroups', () => {
  it('separates disconnected clusters; touching cells without an edge are not connected (acceptance F)', () => {
    const nodes = [node('a', [0, 0, 0]), node('b', [1, 0, 0]), node('c', [2, 0, 0]), node('z', [10, 10, 0])];
    const edges = [edge('ab', 'a', 'b')]; // b and c touch but have no edge
    const g = accessGroups(nodes, edges);
    expect(g.count).toBe(3);
    expect(g.groupOf.get('a')).toBe(g.groupOf.get('b'));
    expect(g.groupOf.get('c')).not.toBe(g.groupOf.get('b'));
    expect(g.groupOf.get('z')).not.toBe(g.groupOf.get('a'));
  });

  it('is deterministic regardless of array order, numbering groups by their smallest ID', () => {
    const nodes = [node('m', [0, 0, 0]), node('b', [1, 0, 0]), node('q', [5, 0, 0]), node('a', [6, 0, 0])];
    const edges = [edge('e1', 'm', 'b'), edge('e2', 'q', 'a')];
    const forward = accessGroups(nodes, edges);
    const reversed = accessGroups([...nodes].reverse(), [...edges].reverse());
    expect([...reversed.groupOf].sort()).toEqual([...forward.groupOf].sort());
    expect(forward.groupOf.get('a')).toBe(0); // {a, q}
    expect(forward.groupOf.get('b')).toBe(1); // {b, m}
  });
});

describe('selectionEmphasis', () => {
  const doc = threeRooms();
  it('highlights a selected node only', () => {
    const e = selectionEmphasis(selectNode('a'), doc.edges);
    expect([...e.primaryNodes]).toEqual(['a']);
    expect(e.secondaryNodes.size + e.edges.size).toBe(0);
  });

  it('highlights a selected edge and softly its endpoints', () => {
    const e = selectionEmphasis(selectEdge('ac'), doc.edges);
    expect([...e.edges]).toEqual(['ac']);
    expect([...e.secondaryNodes].sort()).toEqual(['a', 'c']);
    expect(e.primaryNodes.size).toBe(0);
  });

  it('highlights nothing for no selection or an unknown edge', () => {
    for (const sel of [NO_SELECTION, selectEdge('nope')]) {
      const e = selectionEmphasis(sel, doc.edges);
      expect(e.primaryNodes.size + e.secondaryNodes.size + e.edges.size).toBe(0);
    }
  });
});
