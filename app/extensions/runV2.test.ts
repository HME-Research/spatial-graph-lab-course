import { beforeAll, describe, expect, it } from 'vitest';
import { expectOk } from '@app/document/test-fixtures';
import { MAX_ROOM_SIZE, readDesignJson, validateDocumentV2, type DesignDocumentV2 } from '@app/document';
import { resolveRelationships } from '@app/spatial';
import { defineSpatialAlgorithm, roomCells, type SpatialAlgorithmContext, type SpatialOperation } from '@student-api';
import type { ActiveToolkit } from './activate';
import { galleryToolkit, TWO_STOREY_TEXT } from './test-toolkit';
import { runAlgorithmV2 } from './run';
import { expectDiagnostic, expectExtOk, labToolkit } from './test-fixtures';

/**
 * Student API on the design document (docs/CONTRACTS-V2.md §7): footprint-aware queries, only the
 * relationship kinds access/open, and transformations validated with `validateDocumentV2`.
 */

const ALG = 'toolkits/lab/algorithms/t.ts';

async function transforming(operations: readonly SpatialOperation[] | ((ctx: SpatialAlgorithmContext) => readonly SpatialOperation[])) {
  return labToolkit({
    [ALG]: {
      default: defineSpatialAlgorithm({
        id: 't',
        label: 'T',
        run: (ctx) => ({ kind: 'transformation', operations: typeof operations === 'function' ? operations(ctx) : operations }),
      }),
    },
  });
}

/** Lab rooms in v2: a 2×2×1 gallery 1, gallery 2 east of it, studio 3 far away on storey 0; access edge 1 (1–2). */
function labV2(): DesignDocumentV2 {
  return expectOk(
    validateDocumentV2({
      schemaVersion: 2,
      metadata: { name: 'Lab v2' },
      nodes: [
        { id: 1, position: [0, 0, 0], size: [2, 2, 1], function: 'gallery', custom: { daylight: 'high' } },
        { id: 2, position: [2, 1, 0], function: 'gallery', custom: {} },
        { id: 3, position: [0, 5, 0], function: 'studio', custom: {} },
      ],
      edges: [{ id: 1, source: 1, target: 2, relationship: 'access', custom: {} }],
    }),
  );
}

describe('spatial context on a v2 document', () => {
  it('nodeAt uses footprints; touches and canRelate answer different questions', async () => {
    let seen: SpatialAlgorithmContext | undefined;
    const project = await transforming((ctx) => ((seen = ctx), []));
    expectExtOk(runAlgorithmV2(labV2(), project, 't'));
    const ctx = seen!;
    expect(ctx.nodeAt([1, 1, 0])).toBe(1);
    expect(ctx.nodeAt([2, 0, 0])).toBeUndefined();
    expect(ctx.design.nodes[0]!.size).toEqual([2, 2, 1]);
    expect(roomCells(ctx.design.nodes[0]!)).toHaveLength(4);
    // touches: direct contact between rooms (multi-cell aware).
    expect(ctx.touches(1, 2)).toBe(true);
    expect(ctx.touches(1, 3)).toBe(false);
    expect(ctx.touches(1, 1)).toBe(false);
    expect(ctx.touches(1, 99)).toBe(false); // no such room
    // canRelate: may a relationship be created (no adjacency needed).
    expect(ctx.canRelate(1, 3)).toBe(true);
    expect(ctx.canRelate(2, 1)).toBe(false); // already related
    expect(ctx.canRelate(1, 1)).toBe(false);
    expect(ctx.canRelate(1, 99)).toBe(false);
    // The retired schema-v1 cell query is gone (P4).
    expect(Object.keys(ctx).some((k) => k.startsWith('canConn'))).toBe(false);
  });
});

describe('transformations on a v2 document', () => {
  it('adds a relationship between rooms that do not touch (valid; spatial status is derived)', async () => {
    const project = await transforming([{ op: 'add-edge', source: 1, target: 3, relationship: 'access' }]);
    const outcome = expectExtOk(runAlgorithmV2(labV2(), project, 't'));
    if (outcome.kind !== 'transformation') throw new Error('expected a transformation');
    expect(outcome.preview.after.edges.at(-1)).toEqual({ id: 2, source: 1, target: 3, relationship: 'access', custom: {} });
    expect(resolveRelationships(outcome.preview.after).byEdge.get(2)!.status).toBe('routed');
  });

  it.each(['door', 'vertical-access', 'atrium'])('refuses the retired schema-v1 kind %s (P4)', async (legacy) => {
    const project = await transforming([{ op: 'add-edge', source: 1, target: 3, relationship: legacy as never }]);
    expectDiagnostic(runAlgorithmV2(labV2(), project, 't'), 'unknown-edge-kind');
  });

  it('rejects unknown kinds, overlapping rooms and invalid sizes', async () => {
    const run = async (op: SpatialOperation) => runAlgorithmV2(labV2(), await transforming([op]), 't');
    expectDiagnostic(await run({ op: 'add-edge', source: 1, target: 3, relationship: 'stair' as never }), 'unknown-edge-kind');
    expect(
      expectDiagnostic(await run({ op: 'add-node', position: [1, -1, 0], size: [1, 2, 1], function: 'gallery' }), 'occupied-cell').message,
    ).toContain('occupied by node 1');
    expectDiagnostic(await run({ op: 'add-node', position: [9, 9, 0], size: [0, 1, 1], function: 'gallery' }), 'invalid-size');
    expectDiagnostic(await run({ op: 'add-node', position: [9, 9, 0], size: [1.5, 1, 1], function: 'gallery' }), 'invalid-size');
  });

  it('adds a multi-cell room with the next node id from the counter', async () => {
    const project = await transforming([{ op: 'add-node', position: [5, 0, 0], size: [2, 3, 1], function: 'gallery' }]);
    const outcome = expectExtOk(runAlgorithmV2(labV2(), project, 't'));
    expect(outcome.kind === 'transformation' && outcome.preview.after.nodes.at(-1)).toEqual({
      id: 4,
      position: [5, 0, 0],
      size: [2, 3, 1],
      function: 'gallery',
      custom: {},
    });
    expect(outcome.kind === 'transformation' && outcome.preview.after.nextNodeId).toBe(5);
    expect(outcome.kind === 'transformation' && outcome.preview.displacedRoutes).toEqual([]);
  });

  it('reports (never silently fills) generated connector cells taken by a new room', async () => {
    const withRoute = expectOk(
      validateDocumentV2({ ...labV2(), nextEdgeId: 3, edges: [...labV2().edges, { id: 2, source: 1, target: 3, relationship: 'access', custom: {} }] }),
    );
    const route = resolveRelationships(withRoute).byEdge.get(2)!;
    expect(route.status).toBe('routed');
    const cell = route.status === 'routed' ? route.route.cells[0]! : ([0, 0, 0] as const);
    const project = await transforming([{ op: 'add-node', position: cell, function: 'gallery' }]);
    const outcome = expectExtOk(runAlgorithmV2(withRoute, project, 't'));
    expect(outcome.kind === 'transformation' && outcome.preview.displacedRoutes).toEqual([2]);
  });

  it('never mutates the input document', async () => {
    const doc = labV2();
    const before = JSON.stringify(doc);
    const project = await transforming([
      { op: 'add-node', position: [5, 0, 0], function: 'gallery' },
      { op: 'set-node-custom-attribute', nodeId: 2, key: 'daylight', value: 'low' },
    ]);
    expectExtOk(runAlgorithmV2(doc, project, 't'));
    expect(JSON.stringify(doc)).toBe(before);
  });
});

describe('set-node-geometry: move and resize rooms (P4, additive)', () => {
  const after = async (ops: readonly SpatialOperation[], doc = labV2()) => {
    const outcome = expectExtOk(runAlgorithmV2(doc, await transforming(ops), 't'));
    if (outcome.kind !== 'transformation') throw new Error('expected a transformation');
    return outcome.preview;
  };
  const run = async (ops: readonly SpatialOperation[], doc = labV2()) => runAlgorithmV2(doc, await transforming(ops), 't');

  it('resizes at the minimum corner, grows towards -x by moving the corner, and keeps the draft cells in step', async () => {
    const preview = await after([
      { op: 'set-node-geometry', nodeId: 2, size: [2, 1, 1] }, // 2 now covers [2..3, 1]
      { op: 'set-node-geometry', nodeId: 3, position: [-1, 5, 0], size: [3, 1, 1] }, // grows one column to -x
      { op: 'add-node', position: [0, 6, 0], function: 'studio' }, // free before and after
    ]);
    const node = (id: number) => preview.after.nodes.find((n) => n.id === id)!;
    expect([node(2).position, node(2).size]).toEqual([[2, 1, 0], [2, 1, 1]]);
    expect([node(3).position, node(3).size]).toEqual([[-1, 5, 0], [3, 1, 1]]);
    expect(validateDocumentV2(preview.after).ok).toBe(true);
    // The draft knows the new cells: a later operation cannot take them…
    expect(
      expectDiagnostic(await run([{ op: 'set-node-geometry', nodeId: 2, size: [2, 1, 1] }, { op: 'add-node', position: [3, 1, 0], function: 'gallery' }]), 'occupied-cell')
        .message,
    ).toContain('occupied by node 2');
    // …and cells a room leaves are free again in the same run.
    const moved = await after([
      { op: 'set-node-geometry', nodeId: 3, position: [6, 5, 0] },
      { op: 'add-node', position: [0, 5, 0], function: 'studio' },
    ]);
    expect(moved.after.nodes.find((n) => n.id === 4)!.position).toEqual([0, 5, 0]);
  });

  it('may resize a room added earlier in the same run (by ref)', async () => {
    const preview = await after([
      { op: 'add-node', ref: 'new', position: [5, 0, 0], function: 'gallery' },
      { op: 'set-node-geometry', nodeId: 'new', size: [1, 2, 1] },
    ]);
    expect(preview.after.nodes.find((n) => n.id === 4)!.size).toEqual([1, 2, 1]);
  });

  it('refuses unknown rooms, missing or invalid values, overlaps, the limits and connector cells, naming the operation', async () => {
    expect(expectDiagnostic(await run([{ op: 'set-node-geometry', nodeId: 99, size: [2, 1, 1] }]), 'missing-node').message).toContain(
      'set-node-geometry 99',
    );
    expectDiagnostic(await run([{ op: 'set-node-geometry', nodeId: 2 }]), 'invalid-position');
    expectDiagnostic(await run([{ op: 'set-node-geometry', nodeId: 2, size: [0, 1, 1] }]), 'invalid-size');
    expectDiagnostic(await run([{ op: 'set-node-geometry', nodeId: 2, size: [1.5, 1, 1] }]), 'invalid-size');
    expectDiagnostic(await run([{ op: 'set-node-geometry', nodeId: 2, size: [MAX_ROOM_SIZE + 1, 1, 1] }]), 'invalid-size');
    expectDiagnostic(await run([{ op: 'set-node-geometry', nodeId: 2, position: [0.5, 1, 0] }]), 'invalid-position');
    expectDiagnostic(await run([{ op: 'set-node-geometry', nodeId: 3, position: [1001, 5, 0] }]), 'invalid-position');
    const overlap = expectDiagnostic(await run([{ op: 'set-node-geometry', nodeId: 2, position: [1, 1, 0] }]), 'occupied-cell');
    expect(overlap.message).toBe('operation 1: set-node-geometry 2: cell [1, 1, 0] is already occupied by node 1');
    const withRoute = expectOk(
      validateDocumentV2({ ...labV2(), nextEdgeId: 3, edges: [...labV2().edges, { id: 2, source: 1, target: 3, relationship: 'access' as const, custom: {} }] }),
    );
    const route = resolveRelationships(withRoute).byEdge.get(2)!;
    const cell = route.status === 'routed' ? route.route.cells[0]! : ([0, 0, 0] as const);
    const taken = expectDiagnostic(await run([{ op: 'set-node-geometry', nodeId: 3, position: cell, size: [1, 1, 1] }], withRoute), 'occupied-cell');
    expect(taken.message).toContain('generated connector of edge 2');
    // Nothing changed: the run failed as a whole.
    expect(withRoute.nodes.find((n) => n.id === 3)!.position).toEqual([0, 5, 0]);
  });
});

describe('refs: the app assigns ids to new items in operation order (P4)', () => {
  it('two new rooms with refs, an edge between them by ref and an attribute set by ref get ids from the counters', async () => {
    const doc = labV2(); // nextNodeId 4, nextEdgeId 2
    expect([doc.nextNodeId, doc.nextEdgeId]).toEqual([4, 2]);
    const project = await transforming([
      { op: 'add-node', ref: 'north', position: [5, 0, 0], function: 'gallery' },
      { op: 'add-node', ref: 'south', position: [6, 0, 0], function: 'gallery' },
      { op: 'add-edge', ref: 'link', source: 'north', target: 'south', relationship: 'open' },
      { op: 'add-edge', source: 3, target: 'south', relationship: 'access' },
      { op: 'set-node-custom-attribute', nodeId: 'south', key: 'daylight', value: 'low' },
    ]);
    const outcome = expectExtOk(runAlgorithmV2(doc, project, 't'));
    if (outcome.kind !== 'transformation') throw new Error('expected a transformation');
    const { preview } = outcome;
    expect(preview.assigned).toEqual({ nodes: { north: 4, south: 5 }, edges: { link: 2 } });
    expect(preview.after.nodes.slice(-2).map((n) => n.id)).toEqual([4, 5]);
    expect(preview.after.edges.slice(-2)).toEqual([
      { id: 2, source: 4, target: 5, relationship: 'open', custom: {} },
      { id: 3, source: 3, target: 5, relationship: 'access', custom: {} },
    ]);
    expect(preview.after.nodes.find((n) => n.id === 5)!.custom).toEqual({ daylight: 'low' });
    expect([preview.after.nextNodeId, preview.after.nextEdgeId]).toEqual([6, 4]);
    // The input is untouched (counters included).
    expect([doc.nextNodeId, doc.nextEdgeId]).toEqual([4, 2]);
  });

  it('refuses an unknown ref and a ref reused in the same run', async () => {
    const run = async (ops: readonly SpatialOperation[]) => runAlgorithmV2(labV2(), await transforming(ops), 't');
    expectDiagnostic(await run([{ op: 'add-edge', source: 1, target: 'nowhere', relationship: 'access' }]), 'missing-node');
    expectDiagnostic(await run([{ op: 'set-node-custom-attribute', nodeId: 'nowhere', key: 'daylight', value: 'low' }]), 'missing-node');
    // A ref only names an item added by an EARLIER operation.
    expectDiagnostic(
      await run([
        { op: 'add-edge', source: 1, target: 'later', relationship: 'access' },
        { op: 'add-node', ref: 'later', position: [5, 0, 0], function: 'gallery' },
      ]),
      'missing-node',
    );
    expectDiagnostic(
      await run([
        { op: 'add-node', ref: 'twin', position: [5, 0, 0], function: 'gallery' },
        { op: 'add-node', ref: 'twin', position: [6, 0, 0], function: 'gallery' },
      ]),
      'invalid-id',
    );
    // An unknown NUMBER is refused too (numbers name existing items only).
    expectDiagnostic(await run([{ op: 'add-edge', source: 1, target: 99, relationship: 'access' }]), 'missing-node');
  });
});

describe('the gallery test toolkit on schema v2', () => {
  let toolkit: ActiveToolkit;
  beforeAll(async () => {
    toolkit = await galleryToolkit();
  });
  const design = () => expectOk(readDesignJson(TWO_STOREY_TEXT)).doc;

  it('access-depth counts relationship steps from the entrance', () => {
    expect(expectExtOk(runAlgorithmV2(design(), toolkit, 'access-depth', undefined, { inputs: [1] }))).toEqual({
      kind: 'analysis',
      result: {
        kind: 'analysis',
        value: 0,
        text: '0 room(s) cannot be reached from room 1.',
        highlightNodes: [1],
        // entry-gallery 1, studio-ground 2, reading-gallery 3, store 4, studio-upper 5, gallery-upper 6
        nodeValues: { 1: 0, 2: 1, 3: 1, 4: 2, 5: 1, 6: 2 },
      },
    });
  });

  it('connect-storage-to-galleries adds the one missing access relationship (store – reading gallery)', () => {
    const outcome = expectExtOk(runAlgorithmV2(design(), toolkit, 'connect-storage-to-galleries'));
    if (outcome.kind !== 'transformation') throw new Error('expected a transformation');
    // store 4 → reading gallery 3; the new edge takes nextEdgeId 7.
    expect(outcome.preview.after.edges.at(-1)).toEqual({ id: 7, source: 4, target: 3, relationship: 'access', custom: {} });
    expect(outcome.preview.after.nextEdgeId).toBe(8);
    expect(resolveRelationships(outcome.preview.after).byEdge.get(7)!.status).toBe('direct');
    const again = expectExtOk(runAlgorithmV2(outcome.preview.after, toolkit, 'connect-storage-to-galleries'));
    expect(again.kind === 'transformation' && again.preview.operations).toEqual([]);
  });

  it('daylight-from-exposure changes only the entry gallery (two exposed walls → medium)', () => {
    const outcome = expectExtOk(runAlgorithmV2(design(), toolkit, 'daylight-from-exposure'));
    if (outcome.kind !== 'transformation') throw new Error('expected a transformation');
    expect(outcome.preview.operations).toEqual([{ op: 'set-node-custom-attribute', nodeId: 1, key: 'daylight', value: 'medium' }]);
  });

  it('never changes the design it ran on', () => {
    const doc = design();
    const before = JSON.stringify(doc);
    for (const a of toolkit.algorithms) runAlgorithmV2(doc, toolkit, a.id);
    expect(JSON.stringify(doc)).toBe(before);
    expect(validateDocumentV2(doc).ok).toBe(true);
  });
});
