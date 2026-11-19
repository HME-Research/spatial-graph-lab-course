import { beforeAll, describe, expect, it } from 'vitest';
import { type DesignDocumentV2, validateDocumentV2 } from '@app/document';
import { expectOk } from '@app/document/test-fixtures';
import builtInHouse from '@app/document/examples/house.json';
import { resolveRelationships } from '@app/spatial';
import type { SpatialAlgorithm, SpatialAlgorithmContext } from '@student-api';
import { activateToolkit, type ActiveToolkit } from './activate';
import { buildSpatialContextV2 } from './context';
import { discoverToolkits } from './discover';
import { runAlgorithmV2 } from './run';
import { expectExtOk } from './test-fixtures';
import { TOOLKIT_GLOBS } from './toolkitGlobs';

/**
 * The owner's reference toolkit `toolkits/house/` (P4 E): its design is the built-in house, and its
 * transform "Grow to target area" is deterministic, never overlaps, keeps related rooms touching,
 * follows the priority order and reads every attribute the toolkit declares. Loaded through the
 * same globs as the app (toolkits are never imported directly by app code).
 */

const GROW = 'grow-to-target-area';
let house: ActiveToolkit;

beforeAll(async () => {
  const source = discoverToolkits(TOOLKIT_GLOBS).toolkits.find((t) => t.id === 'house');
  if (!source) throw new Error('toolkits/house is missing');
  const activation = await activateToolkit(source);
  if (activation.status !== 'active') throw new Error('toolkits/house did not activate');
  house = activation.toolkit;
});

const houseDesign = (): DesignDocumentV2 => {
  const design = house.designs.find((d) => d.id === 'house')!;
  if (!design.result.ok) throw new Error('designs/house.json is invalid');
  return design.result.value;
};

type Room = { id: number; grid: [number, number, number]; size?: [number, number, number]; typeId: string; attributes?: Record<string, number> };

function design(nodes: readonly Room[], edges: readonly [number, number][] = []): DesignDocumentV2 {
  return expectOk(
    validateDocumentV2({
      schemaVersion: 2,
      metadata: { name: 'test' },
      nodes: nodes.map((n) => ({ size: [1, 1, 1], attributes: {}, ...n })),
      edges: edges.map(([source, target], i) => ({ id: i + 1, source, target, kind: 'access', attributes: {} })),
    }),
  );
}

function grow(doc: DesignDocumentV2) {
  const outcome = expectExtOk(runAlgorithmV2(doc, house, GROW));
  if (outcome.kind !== 'transformation') throw new Error('expected a transformation');
  return outcome.preview;
}

const box = (doc: DesignDocumentV2, id: number) => {
  const n = doc.nodes.find((r) => r.id === id)!;
  return { grid: n.grid, size: n.size };
};

/** Relationships whose rooms share a wall or floor ("direct"). */
const direct = (doc: DesignDocumentV2) =>
  [...resolveRelationships(doc).byEdge.entries()].filter(([, r]) => r.status === 'direct').map(([id]) => id).sort();

describe('toolkits/house', () => {
  it('has the six Functions of the reference house and exactly two attributes, targetArea and priority', () => {
    expect(house.definition.name).toBe('House');
    expect(house.nodeTypes.map((t) => t.definition.id).sort()).toEqual(['bath', 'bedroom', 'circulation', 'entrance', 'kitchen', 'living']);
    expect(house.attributeBaseline.schema.nodes.map((f) => f.key).sort()).toEqual(['priority', 'targetArea']);
    expect(house.attributeBaseline.schema.edges).toEqual([]);
    expect(house.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
  });

  it('its house design is exactly the built-in house (ids, geometry, edges, counters, diagram)', () => {
    const builtIn = expectOk(validateDocumentV2(builtInHouse));
    const mine = houseDesign();
    for (const key of ['nodes', 'edges', 'nextNodeId', 'nextEdgeId', 'diagram'] as const) expect(mine[key]).toEqual(builtIn[key]);
  });
});

describe('Grow to target area on the house design', () => {
  it('every room starts as one cell; every related pair touches and every upper room stands on a ground room', () => {
    const doc = houseDesign();
    expect(doc.nodes.every((n) => n.size.join() === '1,1,1')).toBe(true);
    expect(direct(doc)).toEqual(doc.edges.map((e) => e.id).sort());
    const ground = new Set(doc.nodes.filter((n) => n.grid[2] === 0).map((n) => `${n.grid[0]},${n.grid[1]}`));
    expect(doc.nodes.filter((n) => n.grid[2] === 1).every((n) => ground.has(`${n.grid[0]},${n.grid[1]}`))).toBe(true);
  });

  it('grows every room below its target to the target, with nothing blocked, into a compact house', () => {
    const preview = grow(houseDesign());
    expect(preview.summary!.split('\n')).toEqual([
      '3 rooms grown, 0 blocked.',
      'Living 2: 9 → 36 m² (target 36) ✓',
      'Kitchen 3: 9 → 18 m² (target 18) ✓',
      'Bedroom 4: 9 → 18 m² (target 18) ✓',
      'Bath 5: 9 m² (target 9) ✓',
      'Entrance 1: 9 m² (target 9) ✓',
    ]);
    expect(preview.operations).toEqual([
      { op: 'set-node-geometry', nodeId: 2, grid: [1, 1, 0], size: [2, 2, 1] },
      { op: 'set-node-geometry', nodeId: 3, grid: [1, 0, 0], size: [2, 1, 1] },
      { op: 'set-node-geometry', nodeId: 4, grid: [1, 1, 1], size: [2, 1, 1] },
    ]);
    // Ground: entrance porch, 2 × 2 living room, kitchen beside it; upstairs: bath and bedroom in a
    // row over the entrance and the living room.
    const cells = (z: number) =>
      preview.after.nodes
        .filter((n) => n.grid[2] === z)
        .flatMap((n) => Array.from({ length: n.size[0] * n.size[1] }, (_, k) => `${n.grid[0] + (k % n.size[0])},${n.grid[1] + Math.floor(k / n.size[0])}`))
        .sort();
    expect(cells(0)).toEqual(['0,1', '1,0', '1,1', '1,2', '2,0', '2,1', '2,2']);
    expect(cells(1)).toEqual(['0,1', '1,1', '2,1']);
    expect(direct(preview.after)).toEqual(direct(preview.before));
    expect(preview.displacedRoutes).toEqual([]);
  });

  it('is deterministic', () => {
    expect(grow(houseDesign())).toEqual(grow(houseDesign()));
  });

  it('a room override changes the result (targetArea on the room beats its Function default)', () => {
    const doc = houseDesign();
    const bigger = { ...doc, nodes: doc.nodes.map((n) => (n.id === 3 ? { ...n, attributes: { targetArea: 27 } } : n)) };
    const preview = grow(expectOk(validateDocumentV2(bigger)));
    expect(preview.summary).toContain('Kitchen 3: 9 → 27 m² (target 27) ✓');
    expect(box(preview.after, 3)).toEqual({ grid: [1, 0, 0], size: [3, 1, 1] });
  });

  it('reports a blocked room with its reasons', () => {
    // Upstairs, the bedroom has the landing on one side and nothing to stand on elsewhere.
    const preview = grow(
      design(
        [
          { id: 1, grid: [0, 0, 0], typeId: 'living', attributes: { targetArea: 9 } },
          { id: 2, grid: [0, 0, 1], typeId: 'bedroom' },
          { id: 3, grid: [1, 0, 1], typeId: 'circulation' },
          { id: 4, grid: [1, 0, 0], typeId: 'circulation' },
        ],
        [
          [1, 4],
          [4, 3],
          [3, 2],
        ],
      ),
    );
    expect(preview.summary!.split('\n').slice(0, 3)).toEqual([
      '0 rooms grown, 1 blocked.',
      'Living 1: 9 m² (target 9) ✓',
      'Bedroom 2: 9 of 18 m² — blocked by Circulation 3; no room below to build on',
    ]);
    expect(preview.operations).toEqual([]);
  });
});

describe('Grow to target area: houses', () => {
  /** Grid cells of the rooms `ids`, as "x,y,z". */
  const cellsOf = (doc: DesignDocumentV2, ids: readonly number[]) =>
    doc.nodes
      .filter((n) => ids.includes(n.id))
      .flatMap((n) => {
        const out: string[] = [];
        for (let x = n.grid[0]; x < n.grid[0] + n.size[0]; x++)
          for (let y = n.grid[1]; y < n.grid[1] + n.size[1]; y++) for (let z = n.grid[2]; z < n.grid[2] + n.size[2]; z++) out.push(`${x},${y},${z}`);
        return out;
      });
  /** Groups of related rooms (connected components), by lowest id. */
  const groupsOf = (doc: DesignDocumentV2): number[][] => {
    const seen = new Set<number>();
    const groups: number[][] = [];
    for (const start of doc.nodes.map((n) => n.id).sort((a, b) => a - b)) {
      if (seen.has(start)) continue;
      const group: number[] = [];
      const todo = [start];
      seen.add(start);
      while (todo.length > 0) {
        const id = todo.pop()!;
        group.push(id);
        for (const e of doc.edges) {
          const other = e.source === id ? e.target : e.target === id ? e.source : undefined;
          if (other !== undefined && !seen.has(other)) {
            seen.add(other);
            todo.push(other);
          }
        }
      }
      groups.push(group.sort((a, b) => a - b));
    }
    return groups;
  };
  /** No cell of one house shares a face with a cell of another. */
  const housesApart = (doc: DesignDocumentV2) => {
    const owner = new Map<string, number>();
    groupsOf(doc).forEach((ids, h) => cellsOf(doc, ids).forEach((c) => owner.set(c, h)));
    const steps = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ] as const;
    for (const [c, h] of owner) {
      const [x, y, z] = c.split(',').map(Number) as [number, number, number];
      for (const [dx, dy, dz] of steps) {
        const near = owner.get(`${x + dx},${y + dy},${z + dz}`);
        if (near !== undefined && near !== h) return false;
      }
    }
    return true;
  };
  const growWith = (doc: DesignDocumentV2, params: Record<string, unknown>) => {
    const outcome = expectExtOk(runAlgorithmV2(doc, house, GROW, params));
    if (outcome.kind !== 'transformation') throw new Error('expected a transformation');
    return outcome.preview;
  };

  it('treats each group of related rooms as one house (a room without relationships is its own house)', () => {
    const preview = grow(
      design(
        [
          { id: 1, grid: [0, 0, 0], typeId: 'kitchen' },
          { id: 2, grid: [10, 0, 0], typeId: 'kitchen' },
          { id: 3, grid: [1, 0, 0], typeId: 'entrance' },
        ],
        [[1, 3]],
      ),
    );
    expect(preview.summary!.split('\n')).toEqual([
      '2 rooms grown, 0 blocked.',
      'House 1 · Kitchen 1: 9 → 18 m² (target 18) ✓',
      'House 1 · Entrance 3: 9 m² (target 9) ✓',
      'House 2 · Kitchen 2: 9 → 18 m² (target 18) ✓',
    ]);
  });

  it('never lets houses touch: a new cell may not share a face (also above or below) with another house', () => {
    // Bath 2 (House 2) sits diagonally: +x would face outside and come first, but its new cell
    // would share a wall with Bath 2, so Bath 1 grows on -x instead.
    const gap = grow(
      design([
        { id: 1, grid: [0, 0, 0], typeId: 'bath', attributes: { targetArea: 18 } },
        { id: 2, grid: [1, 1, 0], typeId: 'bath' },
      ]),
    );
    expect(box(gap.after, 1)).toEqual({ grid: [-1, 0, 0], size: [2, 1, 1] });
    // Kitchen 1 is walled in by its own house; its only free cell lies under a room of House 2.
    const walled = grow(
      design(
        [
          { id: 1, grid: [0, 0, 0], typeId: 'kitchen' },
          { id: 2, grid: [-1, 0, 0], typeId: 'entrance' },
          { id: 3, grid: [0, 1, 0], typeId: 'entrance' },
          { id: 4, grid: [0, -1, 0], typeId: 'entrance' },
          { id: 5, grid: [1, 0, 1], typeId: 'bath' },
        ],
        [
          [1, 2],
          [1, 3],
          [1, 4],
        ],
      ),
    );
    expect(walled.summary).toContain('House 1 · Kitchen 1: 9 of 18 m² — no free space; too close to House 2');
    expect(walled.operations).toEqual([]);
    // Ringed by one other house: every side is too close.
    const ringed = grow(
      design(
        [
          { id: 1, grid: [0, 0, 0], typeId: 'kitchen' },
          { id: 2, grid: [2, 0, 0], typeId: 'entrance' },
          { id: 3, grid: [-2, 0, 0], typeId: 'entrance' },
          { id: 4, grid: [0, 2, 0], typeId: 'entrance' },
          { id: 5, grid: [0, -2, 0], typeId: 'entrance' },
        ],
        [
          [2, 4],
          [4, 3],
          [3, 5],
        ],
      ),
    );
    expect(ringed.summary!.split('\n').slice(0, 2)).toEqual(['0 rooms grown, 1 blocked.', 'House 1 · Kitchen 1: 9 of 18 m² — too close to House 2']);
  });

  it('Houses 3 adds two copies of House 1 that all grow to their targets, apart, with nothing blocked', () => {
    const doc = houseDesign();
    const preview = growWith(doc, { houses: 3 });
    const lines = preview.summary!.split('\n');
    expect(lines.slice(0, 3)).toEqual(['9 rooms grown, 0 blocked.', 'Added 2 copies of House 1, to make 3 houses.', 'House 1 · Living 2: 9 → 36 m² (target 36) ✓']);
    expect(lines).toContain('House 2 · Kitchen (copy of 3): 9 → 18 m² (target 18) ✓');
    expect(lines).toContain('House 3 · Bedroom (copy of 4): 9 → 18 m² (target 18) ✓');
    expect(lines.filter((l) => l.includes('—'))).toEqual([]);
    expect(lines).toHaveLength(2 + 15);
    // Rooms by ref, relationships by ref with their kinds; algorithms never choose ids.
    const adds = preview.operations.filter((o) => o.op === 'add-node');
    const links = preview.operations.filter((o) => o.op === 'add-edge');
    expect(adds).toHaveLength(10);
    expect(links).toHaveLength(8);
    expect(links.map((o) => o.kind).sort()).toEqual([...doc.edges, ...doc.edges].map((e) => e.kind).sort());
    expect(adds[0]).toEqual({ op: 'add-node', ref: 'house-2-room-1', grid: [9, 1, 0], size: [1, 1, 1], typeId: 'entrance', attributes: {} });
    const after = preview.after;
    expect(validateDocumentV2(after).ok).toBe(true);
    const groups = groupsOf(after);
    expect(groups).toHaveLength(3);
    expect(housesApart(after)).toBe(true);
    // Every copy is House 1 moved along +x.
    const shape = (ids: readonly number[]) => {
      const rooms = after.nodes.filter((n) => ids.includes(n.id)).sort((a, b) => a.id - b.id);
      const x0 = Math.min(...rooms.map((n) => n.grid[0]));
      return rooms.map((n) => [n.typeId, n.grid[0] - x0, n.grid[1], n.grid[2], ...n.size]);
    };
    expect(shape(groups[1]!)).toEqual(shape(groups[0]!));
    expect(shape(groups[2]!)).toEqual(shape(groups[0]!));
    // Running again with the same number adds nothing (it counts the houses already there).
    const again = growWith(after, { houses: 3 });
    expect(again.operations).toEqual([]);
    expect(again.summary!.split('\n')[0]).toBe('0 rooms grown, 0 blocked.');
    expect(again.summary).not.toContain('Added');
    // Fewer than drawn: nothing is removed, all grow, and a note says so.
    const fewer = growWith(after, { houses: 1 });
    expect(fewer.operations).toEqual([]);
    expect(fewer.summary!.split('\n')[1]).toBe('Houses is 1, but 3 houses are drawn: none was removed, and all of them grew.');
  });

  it('copies keep the stored attributes of House 1, and no Houses value means as many as drawn', () => {
    const doc = houseDesign();
    const marked = expectOk(validateDocumentV2({ ...doc, nodes: doc.nodes.map((n) => (n.id === 5 ? { ...n, attributes: { priority: 2 } } : n)) }));
    const adds = growWith(marked, { houses: 2 }).operations.filter((o) => o.op === 'add-node');
    expect(adds.find((o) => o.ref === 'house-2-room-5')).toMatchObject({ typeId: 'bath', attributes: { priority: 2 } });
    expect(growWith(doc, {}).operations.some((o) => o.op === 'add-node')).toBe(false);
    expect(growWith(doc, { houses: 1 }).operations.some((o) => o.op === 'add-node')).toBe(false);
    expect(growWith(doc, { houses: 2.5 }).summary).toBe('Houses must be a whole number, like 1, 2 or 3 (not 2.5).');
  });
});

describe('Grow to target area: rules', () => {
  it('grows to the target in one row or column at a time, preferring the side closest to the target', () => {
    // A 2×1 kitchen alone wanting 27 m²: +y would give 36 m², ±x gives 27 m² = the target; +x comes first.
    const preview = grow(design([{ id: 1, grid: [0, 0, 0], size: [2, 1, 1], typeId: 'kitchen', attributes: { targetArea: 27 } }]));
    expect(box(preview.after, 1)).toEqual({ grid: [0, 0, 0], size: [3, 1, 1] });
  });

  it('prefers a side that faces outside over a pocket between rooms', () => {
    // Bath 2 at x=0 has a one-cell pocket on +x (room 3 beyond it); -x faces outside. Room 4 makes
    // the three rooms one house.
    const preview = grow(
      design(
        [
          { id: 2, grid: [0, 0, 0], typeId: 'bath', attributes: { targetArea: 18 } },
          { id: 3, grid: [2, 0, 0], typeId: 'entrance' },
          { id: 4, grid: [1, 1, 0], typeId: 'entrance' },
        ],
        [
          [2, 4],
          [4, 3],
        ],
      ),
    );
    expect(box(preview.after, 2)).toEqual({ grid: [-1, 0, 0], size: [2, 1, 1] });
  });

  it('never overlaps, keeps every related pair touching and keeps corridor cells free, even with huge targets', () => {
    const doc = houseDesign();
    const greedy = expectOk(validateDocumentV2({ ...doc, nodes: doc.nodes.map((n) => ({ ...n, attributes: { targetArea: 300 } })) }));
    const preview = grow(greedy);
    expect(validateDocumentV2(preview.after).ok).toBe(true); // overlaps are invalid
    expect(direct(preview.after)).toEqual(direct(greedy));
    // A related pair lined up on one storey, not touching: the corridor between them stays free.
    const pair = design(
      [
        { id: 1, grid: [0, 0, 0], typeId: 'bath', attributes: { targetArea: 18 } },
        { id: 2, grid: [3, 0, 0], typeId: 'entrance' },
      ],
      [[1, 2]],
    );
    const after = grow(pair).after;
    expect(box(after, 1)).toEqual({ grid: [-1, 0, 0], size: [2, 1, 1] });
    expect(resolveRelationships(after).byEdge.get(1)!.status).toBe('routed');
  });

  it('follows the priority order (ties by id): the first room takes the one supported cell', () => {
    // Ground 3×1 hall; upstairs two baths with one free cell between them, both wanting 18 m².
    const rooms = (p1: number, p2: number) =>
      design(
        [
          { id: 1, grid: [0, 0, 0], size: [3, 1, 1], typeId: 'living', attributes: { targetArea: 27 } },
          { id: 2, grid: [0, 0, 1], typeId: 'bath', attributes: { priority: p1, targetArea: 18 } },
          { id: 3, grid: [2, 0, 1], typeId: 'bath', attributes: { priority: p2, targetArea: 18 } },
        ],
        [
          [1, 2],
          [1, 3],
        ],
      );
    const first = grow(rooms(1, 2)).summary!;
    expect(first).toContain('Bath 2: 9 → 18 m² (target 18) ✓');
    expect(first).toContain('Bath 3: 9 of 18 m² — blocked by Bath 2; no room below to build on');
    const swapped = grow(rooms(2, 1)).summary!;
    expect(swapped).toContain('Bath 3: 9 → 18 m² (target 18) ✓');
    expect(swapped).toContain('Bath 2: 9 of 18 m² — blocked by Bath 3; no room below to build on');
    // Equal priorities: the lower id first.
    expect(grow(rooms(4, 4)).summary).toContain('Bath 2: 9 → 18 m² (target 18) ✓');
  });

  it('stops when blocked and names the reason', () => {
    const boxedIn = grow(
      design([
        { id: 1, grid: [1, 1, 0], typeId: 'bath', attributes: { targetArea: 18 } },
        { id: 2, grid: [0, 1, 0], typeId: 'entrance' },
        { id: 3, grid: [2, 1, 0], typeId: 'entrance' },
        { id: 4, grid: [1, 0, 0], typeId: 'entrance' },
        { id: 5, grid: [1, 2, 0], typeId: 'entrance' },
      ]),
    );
    expect(boxedIn.operations).toEqual([]);
    expect(boxedIn.summary).toContain('Bath 1: 9 of 18 m² — no free space');
    const huge = grow(design([{ id: 1, grid: [0, 0, 0], typeId: 'bath', attributes: { targetArea: 10_000 } }]));
    expect(huge.summary).toContain('Bath 1: 9 → 9216 of 10000 m² — largest room size reached');
    expect(box(huge.after, 1).size).toEqual([32, 32, 1]);
  });

  it('leaves rooms without a target area (a Function the toolkit does not define)', () => {
    const preview = grow(design([{ id: 1, grid: [0, 0, 0], typeId: 'garage' }]));
    expect(preview.operations).toEqual([]);
    expect(preview.summary).toContain('Garage 1: no target area, left as it is');
  });
});

describe('every House attribute is used', () => {
  it('the transform reads every node and edge attribute the toolkit declares', () => {
    const doc = houseDesign();
    const algorithm = house.algorithms.find((a) => a.id === GROW)!.definition as SpatialAlgorithm;
    const ctx = buildSpatialContextV2(doc, house, GROW, {});
    const read = new Set<string>();
    const spy = <T extends object>(values: T): T => new Proxy(values, { get: (t, k) => (typeof k === 'string' && read.add(k), Reflect.get(t, k)) });
    const watched: SpatialAlgorithmContext = {
      ...ctx,
      nodeAt: ctx.nodeAt,
      touches: ctx.touches,
      canRelate: ctx.canRelate,
      attributesOf: ctx.attributesOf,
      nodeAttributes: (id) => spy(ctx.nodeAttributes(id)),
      edgeAttributes: (id) => spy(ctx.edgeAttributes(id)),
    };
    algorithm.run(watched);
    const declared = [...house.attributeBaseline.schema.nodes, ...house.attributeBaseline.schema.edges].map((f) => f.key);
    expect(declared.filter((k) => !read.has(k))).toEqual([]);
  });
});
