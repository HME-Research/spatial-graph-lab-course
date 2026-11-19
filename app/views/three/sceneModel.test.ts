import { describe, expect, it } from 'vitest';
import type { DesignDocumentV2, RelationshipEdge, RoomNode } from '@app/document';
import { threeRooms } from '@app/document/test-fixtures';
import { DEFAULT_CELL_SIZE, spatialToThree } from '@core/viewer/coordinates';
import {
  accessGroups,
  buildEdgeItems,
  buildNodeItems,
  cellBounds,
  framingFor,
  groundGrid,
  storeyLevels,
} from './sceneModel';
import { fitCameraToBounds } from '@core/viewer/three/viewport';

const node = (id: number, grid: [number, number, number], functionId = 'room'): RoomNode => ({
  id,
  position: grid,
  size: [1, 1, 1],
  function: functionId,
  custom: {},
});
const edge = (id: number, source: number, target: number, kind: RelationshipEdge['relationship'] = 'access'): RelationshipEdge => ({
  id,
  source,
  target,
  relationship: kind,
  custom: {},
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
      [1, spatialToThree([0, 0, 0]), 0],
      [2, spatialToThree([1, 0, 0]), 0],
      [3, spatialToThree([0, 0, 1]), 1],
    ]);
  });

  it('draws edges centre to centre', () => {
    const items = buildEdgeItems(threeRooms().nodes, threeRooms().edges);
    const ab = items.find((e) => e.id === 1)!;
    const ac = items.find((e) => e.id === 2)!;
    expect(ab).toMatchObject({ relationship: 'access', start: [0, 1.5, 0], end: [3, 1.5, 0], length: 3, direction: [1, 0, 0] });
    expect(ab.mid).toEqual([1.5, 1.5, 0]);
    expect(ac).toMatchObject({ relationship: 'open', start: [0, 1.5, 0], end: [0, 4.5, 0], length: 3, direction: [0, 1, 0] });
  });

  it('skips edges whose endpoint is missing instead of throwing', () => {
    const items = buildEdgeItems([node(1, [0, 0, 0])], [edge(1, 1, 99)]);
    expect(items).toEqual([]);
  });

  it('ignores diagram positions and never mutates the document', () => {
    const doc = deepFreeze(threeRooms());
    const moved: DesignDocumentV2 = { ...doc, diagram: { positions: { 1: [999, -999], 2: [0, 0], 3: [5, 5] } } };
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
    expect(storeyLevels([node(1, [0, 0, 2]), node(2, [0, 0, -1]), node(3, [1, 0, 2])])).toEqual([-1, 2]);
  });

  it('cellBounds covers full cell extents, and is null for an empty document', () => {
    expect(cellBounds([])).toBeNull();
    expect(cellBounds(threeRooms().nodes)).toEqual({ min: [-1.5, 0, -1.5], max: [4.5, 6, 1.5] });
  });
});

describe('framingFor', () => {
  it('frames the occupied cell bounds, never tighter than one cell', () => {
    const bounds = cellBounds(threeRooms().nodes)!;
    const framing = framingFor(bounds);
    expect(framing.bounds).toBe(bounds);
    expect(framing.minRadius).toBe(DEFAULT_CELL_SIZE.horizontal);
    const fit = fitCameraToBounds(framing.bounds, 45, framing.minRadius, 1.6);
    expect(fit.target).toEqual([1.5, 3, 0]);
    expect(fit.position[1]).toBeGreaterThan(fit.target[1]); // looking down onto the building
  });

  it('frames a sensible default for an empty document', () => {
    const framing = framingFor(null);
    const fit = fitCameraToBounds(framing.bounds, 45, framing.minRadius);
    expect(fit.target).toEqual([0, DEFAULT_CELL_SIZE.vertical / 2, 0]);
    expect(fit.position.every(Number.isFinite)).toBe(true);
  });

  it('frames widely separated groups together', () => {
    const nodes = [node(1, [0, 0, 0]), node(2, [40, -30, 3])];
    const framing = framingFor(cellBounds(nodes));
    const fit = fitCameraToBounds(framing.bounds, 45, framing.minRadius);
    const a = spatialToThree([0, 0, 0]);
    const b = spatialToThree([40, -30, 3]);
    expect(fit.target).toEqual([(a[0] + b[0]) / 2, (0 + 4 * 3) / 2, (a[2] + b[2]) / 2]);
  });
});

describe('groundGrid', () => {
  it('aligns lines with cell boundaries and covers every cell plus margin', () => {
    const nodes = [node(1, [0, 0, 0]), node(2, [3, 0, 0]), node(3, [-2, 5, 1])];
    const g = groundGrid(nodes, DEFAULT_CELL_SIZE, 2);
    const h = DEFAULT_CELL_SIZE.horizontal;
    expect(g.divisions % 2).toBe(0);
    expect(g.size).toBe(g.divisions * h);
    expect(g.center[1]).toBe(0);
    // Centre sits on a cell boundary: (X / h) is a half-integer.
    expect(Math.abs(((g.center[0] / h) % 1) + 0)).toBeCloseTo(0.5);
    expect(Math.abs(((g.center[2] / h) % 1) + 0)).toBeCloseTo(0.5);
    for (const n of nodes) {
      const [x, , z] = spatialToThree(n.position);
      expect(Math.abs(x - g.center[0]) + h / 2 + 2 * h).toBeLessThanOrEqual(g.size / 2);
      expect(Math.abs(z - g.center[2]) + h / 2 + 2 * h).toBeLessThanOrEqual(g.size / 2);
    }
  });
});

describe('accessGroups', () => {
  it('separates disconnected clusters; touching cells without an edge are not connected (acceptance F)', () => {
    const nodes = [node(1, [0, 0, 0]), node(2, [1, 0, 0]), node(3, [2, 0, 0]), node(9, [10, 10, 0])];
    const edges = [edge(1, 1, 2)]; // 2 and 3 touch but have no edge
    const g = accessGroups(nodes, edges);
    expect(g.count).toBe(3);
    expect(g.groupOf.get(1)).toBe(g.groupOf.get(2));
    expect(g.groupOf.get(3)).not.toBe(g.groupOf.get(2));
    expect(g.groupOf.get(9)).not.toBe(g.groupOf.get(1));
  });

  it('is deterministic regardless of array order, numbering groups by their smallest ID', () => {
    const nodes = [node(4, [0, 0, 0]), node(2, [1, 0, 0]), node(3, [5, 0, 0]), node(1, [6, 0, 0])];
    const edges = [edge(1, 4, 2), edge(2, 3, 1)];
    const forward = accessGroups(nodes, edges);
    const reversed = accessGroups([...nodes].reverse(), [...edges].reverse());
    expect([...reversed.groupOf].sort()).toEqual([...forward.groupOf].sort());
    expect(forward.groupOf.get(1)).toBe(0); // {1, 3}
    expect(forward.groupOf.get(2)).toBe(1); // {2, 4}
  });
});
