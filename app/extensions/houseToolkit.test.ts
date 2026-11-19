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
  it('grows the kitchen and the bath, leaves the reached rooms, and reports the blocked bedroom', () => {
    const preview = grow(houseDesign());
    expect(preview.summary!.split('\n')).toEqual([
      '2 rooms grown, 1 blocked.',
      'Living 3: 36 m² (target 36) ✓',
      'Kitchen 4: 18 → 27 m² (target 27) ✓',
      'Bedroom 6: 36 of 45 m² — blocked by Circulation 5; no room below to build on',
      'Bath 7: 9 → 18 m² (target 18) ✓',
      'Entrance 1: 9 m² (target 9) ✓',
      'Circulation 2: 9 m² (target 9) ✓',
      'Circulation 5: 9 m² (target 9) ✓',
    ]);
    expect(preview.operations).toEqual([
      { op: 'set-node-geometry', nodeId: 4, grid: [-1, 1, 0], size: [3, 1, 1] },
      { op: 'set-node-geometry', nodeId: 7, grid: [0, 0, 1], size: [1, 2, 1] },
    ]);
    // The bath grew over the kitchen, which grew first (priority 2 before 4).
    expect(box(preview.after, 7)).toEqual({ grid: [0, 0, 1], size: [1, 2, 1] });
    expect(direct(preview.after)).toEqual(direct(preview.before));
    expect(preview.displacedRoutes).toEqual([]);
  });

  it('is deterministic', () => {
    expect(grow(houseDesign())).toEqual(grow(houseDesign()));
  });

  it('a room override changes the result (targetArea on the room beats its Function default)', () => {
    const doc = houseDesign();
    const bigger = { ...doc, nodes: doc.nodes.map((n) => (n.id === 3 ? { ...n, attributes: { targetArea: 54 } } : n)) };
    const preview = grow(expectOk(validateDocumentV2(bigger)));
    expect(preview.summary).toContain('Living 3: 36 → 54 m² (target 54) ✓');
    // The bedroom (priority 3) can now grow over the larger living room (priority 1).
    expect(preview.summary).toContain('Bedroom 6: 36 → 54 m² (target 45) ✓');
  });
});

describe('Grow to target area: rules', () => {
  it('grows to the target in one row or column at a time, preferring the side closest to the target', () => {
    // A 2×1 kitchen alone: +y would give 36 m², ±x gives 27 m² = the target; +x comes first.
    const preview = grow(design([{ id: 1, grid: [0, 0, 0], size: [2, 1, 1], typeId: 'kitchen' }]));
    expect(box(preview.after, 1)).toEqual({ grid: [0, 0, 0], size: [3, 1, 1] });
  });

  it('prefers a side that faces outside over a pocket between rooms', () => {
    // Bath 2 at x=0 has a one-cell pocket on +x (room 3 beyond it); -x faces outside.
    const preview = grow(
      design([
        { id: 2, grid: [0, 0, 0], typeId: 'bath' },
        { id: 3, grid: [2, 0, 0], typeId: 'entrance' },
      ]),
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
        { id: 1, grid: [0, 0, 0], typeId: 'bath' },
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
      design([
        { id: 1, grid: [0, 0, 0], size: [3, 1, 1], typeId: 'living', attributes: { targetArea: 27 } },
        { id: 2, grid: [0, 0, 1], typeId: 'bath', attributes: { priority: p1 } },
        { id: 3, grid: [2, 0, 1], typeId: 'bath', attributes: { priority: p2 } },
      ]);
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
        { id: 1, grid: [1, 1, 0], typeId: 'bath' },
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
