import { describe, expect, it } from 'vitest';
import { validateDocumentV2, type DesignDocumentV2 } from '@app/document';
import { expectOk } from '@app/document/test-fixtures';
import { applyDesignCommand } from './commands';
import { duplicateRoomRequest, findDuplicatePlacement, ringOffsets } from './duplicate';
import { resolveRelationships } from './resolve';

type N = { id: number; position: number[]; size?: number[]; function?: string; custom?: Record<string, unknown> };
type E = { id: number; source: number; target: number };

function make(nodes: N[], edges: E[] = [], positions: Record<string, [number, number]> = {}): DesignDocumentV2 {
  const ids = nodes.map((n) => n.id);
  return expectOk(
    validateDocumentV2({
      schemaVersion: 2,
      metadata: { name: 'dup' },
      nextNodeId: Math.max(0, ...ids) + 1,
      nextEdgeId: Math.max(0, ...edges.map((e) => e.id)) + 1,
      nodes: nodes.map((n) => ({ function: 'room', custom: {}, ...n })),
      edges: edges.map((e) => ({ relationship: 'access', ...e })),
      diagram: { positions },
    }),
  );
}

const placed = (doc: DesignDocumentV2, id: number, limits?: { maxAbsCoordinate: number }) => {
  const p = findDuplicatePlacement(doc, id, limits ? { limits } : {});
  return p.status === 'placed' ? p.position : p.status;
};

describe('ringOffsets', () => {
  it('touching places first, nearest centre first, ties in the order +x, −x, +y, −y', () => {
    expect(ringOffsets(0, 1, 1).slice(0, 4)).toEqual([
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]);
    // Then the four corner-touching places (gap 0, larger centre distance).
    expect(ringOffsets(0, 1, 1)).toHaveLength(8);
    // Gap 1 = one empty cell in between.
    expect(ringOffsets(1, 1, 1)[0]).toEqual([2, 0]);
  });

  it('never overlaps the original on its own storey, but may on another storey', () => {
    expect(ringOffsets(0, 2, 3).some(([dx, dy]) => Math.abs(dx) < 2 && Math.abs(dy) < 3)).toBe(false);
    expect(ringOffsets(0, 2, 3, false)[0]).toEqual([0, 0]);
  });
});

describe('findDuplicatePlacement', () => {
  it('a free neighbour on the same storey: +x first', () => {
    expect(placed(make([{ id: 1, position: [0, 0, 0] }]), 1)).toEqual([1, 0, 0]);
  });

  it('skips blocked neighbours in the order +x, −x, +y, −y', () => {
    const d = make([
      { id: 1, position: [0, 0, 0] },
      { id: 2, position: [1, 0, 0] },
      { id: 3, position: [-1, 0, 0] },
    ]);
    expect(placed(d, 1)).toEqual([0, 1, 0]);
    const all = make([
      { id: 1, position: [0, 0, 0] },
      { id: 2, position: [1, 0, 0] },
      { id: 3, position: [-1, 0, 0] },
      { id: 4, position: [0, 1, 0] },
      { id: 5, position: [0, -1, 0] },
    ]);
    // The four side neighbours are taken: a corner-touching place (gap 0) comes next.
    expect(placed(all, 1)).toEqual([1, 1, 0]);
  });

  it('a multi-cell room needs room for its whole box', () => {
    // A 2×3×1 room; a one-cell room just right of it blocks the +x place, so −x is used.
    const d = make([
      { id: 1, position: [0, 0, 0], size: [2, 3, 1] },
      { id: 2, position: [2, 2, 0] },
    ]);
    expect(placed(d, 1)).toEqual([-2, 0, 0]);
    // A multi-storey room keeps its height on the same base storey.
    const tall = make([{ id: 1, position: [0, 0, 1], size: [1, 1, 2] }]);
    expect(placed(tall, 1)).toEqual([1, 0, 1]);
  });

  it('never takes generated corridor cells', () => {
    // Rooms 1 and 2 are joined by a corridor through [1..3, 0, 0].
    const d = make(
      [
        { id: 1, position: [0, 0, 0] },
        { id: 2, position: [4, 0, 0] },
      ],
      [{ id: 1, source: 1, target: 2 }],
    );
    expect(resolveRelationships(d).byEdge.get(1)!.status).toBe('routed');
    expect(placed(d, 1)).toEqual([-1, 0, 0]);
    expect(placed(d, 2)).toEqual([5, 0, 0]);
  });

  it('respects the coordinate limits and tries other storeys (up first) only when the storey is full', () => {
    // Limits ±1: a 3×3 storey; room 1 fills it.
    const full = make([{ id: 1, position: [-1, -1, 0], size: [3, 3, 1] }]);
    expect(placed(full, 1, { maxAbsCoordinate: 1 })).toEqual([-1, -1, 1]);
    const fullUp = make([
      { id: 1, position: [-1, -1, 0], size: [3, 3, 1] },
      { id: 2, position: [-1, -1, 1], size: [3, 3, 1] },
    ]);
    expect(placed(fullUp, 1, { maxAbsCoordinate: 1 })).toEqual([-1, -1, -1]);
  });

  it('reports when there is no free place', () => {
    const d = make([{ id: 1, position: [-1, -1, -1], size: [3, 3, 3] }]);
    const p = findDuplicatePlacement(d, 1, { limits: { maxAbsCoordinate: 1 } });
    expect(p.status).toBe('no-space');
    const r = duplicateRoomRequest(d, 1, { limits: { maxAbsCoordinate: 1 } });
    expect(r.status === 'refused' && r.message).toMatch(/no free place for a copy of node 1/);
  });
});

describe('duplicateRoomRequest', () => {
  const d = make(
    [
      { id: 1, position: [0, 0, 0], size: [2, 1, 1], function: 'gallery', custom: { public: true, seats: 4 } },
      { id: 4, position: [2, 0, 0], function: 'studio' },
    ],
    [{ id: 3, source: 1, target: 4 }],
    { 1: [0, 0], 4: [200, 0] },
  );

  it('gives the copy the next id, the same function, size and stored values, and no relationships', () => {
    const r = duplicateRoomRequest(d, 1, { diagramPosition: [40, 110] });
    if (r.status !== 'command') throw new Error(r.message);
    expect(r.nodeId).toBe(5);
    const next = expectOk(applyDesignCommand(d, r.command));
    const copy = next.nodes.find((n) => n.id === 5)!;
    expect(copy).toEqual({ id: 5, function: 'gallery', position: r.position, size: [2, 1, 1], custom: { public: true, seats: 4 } });
    expect(copy.custom).not.toBe(d.nodes[0]!.custom);
    expect(next.nextNodeId).toBe(6);
    expect(next.edges).toEqual(d.edges);
    expect(next.diagram.positions[5]).toEqual([40, 110]);
    // The original is untouched.
    expect(next.nodes.find((n) => n.id === 1)).toEqual(d.nodes[0]);
  });

  it('ids are never reused: a second copy gets the next id', () => {
    const first = duplicateRoomRequest(d, 1);
    if (first.status !== 'command') throw new Error(first.message);
    const once = expectOk(applyDesignCommand(d, first.command));
    const second = duplicateRoomRequest(once, 1);
    if (second.status !== 'command') throw new Error(second.message);
    expect(second.nodeId).toBe(6);
    expect(second.position).not.toEqual(first.position);
  });

  it('refuses an unknown room', () => {
    expect(duplicateRoomRequest(d, 99).status).toBe('refused');
  });
});
