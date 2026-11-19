import { beforeAll, describe, expect, it } from 'vitest';
import { expectOk } from '@app/document/test-fixtures';
import { readDesignJson, validateDocumentV2, type DesignDocumentV2 } from '@app/document/v2';
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

/** Lab rooms in v2: a 2×2×1 gallery g1, gallery g2 east of it, studio s1 far away on storey 0. */
function labV2(): DesignDocumentV2 {
  return expectOk(
    validateDocumentV2({
      schemaVersion: 2,
      metadata: { name: 'Lab v2' },
      nodes: [
        { id: 'g1', displayId: '01', grid: [0, 0, 0], size: [2, 2, 1], typeId: 'gallery', attributes: { daylight: 'high' } },
        { id: 'g2', displayId: '02', grid: [2, 1, 0], typeId: 'gallery', attributes: {} },
        { id: 's1', displayId: '03', grid: [0, 5, 0], typeId: 'studio', attributes: {} },
      ],
      edges: [{ id: 'e1', source: 'g1', target: 'g2', kind: 'access', attributes: {} }],
    }),
  );
}

describe('spatial context on a v2 document', () => {
  it('nodeAt uses footprints; touches and canRelate answer different questions', async () => {
    let seen: SpatialAlgorithmContext | undefined;
    const project = await transforming((ctx) => ((seen = ctx), []));
    expectExtOk(runAlgorithmV2(labV2(), project, 't'));
    const ctx = seen!;
    expect(ctx.nodeAt([1, 1, 0])).toBe('g1');
    expect(ctx.nodeAt([2, 0, 0])).toBeUndefined();
    expect(ctx.design.nodes[0]!.size).toEqual([2, 2, 1]);
    expect(roomCells(ctx.design.nodes[0]!)).toHaveLength(4);
    // touches: direct contact between rooms (multi-cell aware).
    expect(ctx.touches('g1', 'g2')).toBe(true);
    expect(ctx.touches('g1', 's1')).toBe(false);
    expect(ctx.touches('g1', 'g1')).toBe(false);
    expect(ctx.touches('g1', 'ghost')).toBe(false);
    // canRelate: may a relationship be created (no adjacency needed).
    expect(ctx.canRelate('g1', 's1')).toBe(true);
    expect(ctx.canRelate('g2', 'g1')).toBe(false); // already related
    expect(ctx.canRelate('g1', 'g1')).toBe(false);
    expect(ctx.canRelate('g1', 'ghost')).toBe(false);
    // The retired schema-v1 cell query is gone (P4).
    expect(Object.keys(ctx).some((k) => k.startsWith('canConn'))).toBe(false);
  });
});

describe('transformations on a v2 document', () => {
  it('adds a relationship between rooms that do not touch (valid; spatial status is derived)', async () => {
    const project = await transforming([{ op: 'add-edge', id: 'e2', source: 'g1', target: 's1', kind: 'access' }]);
    const outcome = expectExtOk(runAlgorithmV2(labV2(), project, 't'));
    if (outcome.kind !== 'transformation') throw new Error('expected a transformation');
    expect(outcome.preview.after.edges.at(-1)).toEqual({ id: 'e2', source: 'g1', target: 's1', kind: 'access', attributes: {} });
    expect(resolveRelationships(outcome.preview.after).byEdge.get('e2')!.status).toBe('routed');
  });

  it.each(['door', 'vertical-access', 'atrium'])('refuses the retired schema-v1 kind %s (P4)', async (legacy) => {
    const project = await transforming([{ op: 'add-edge', id: 'e2', source: 'g1', target: 's1', kind: legacy as never }]);
    expectDiagnostic(runAlgorithmV2(labV2(), project, 't'), 'unknown-edge-kind');
  });

  it('rejects unknown kinds, overlapping rooms and invalid sizes', async () => {
    const run = async (op: SpatialOperation) => runAlgorithmV2(labV2(), await transforming([op]), 't');
    expectDiagnostic(await run({ op: 'add-edge', id: 'x', source: 'g1', target: 's1', kind: 'stair' as never }), 'unknown-edge-kind');
    expect(
      expectDiagnostic(await run({ op: 'add-node', id: 'n', grid: [1, -1, 0], size: [1, 2, 1], typeId: 'gallery' }), 'occupied-cell').message,
    ).toContain('"g1"');
    expectDiagnostic(await run({ op: 'add-node', id: 'n', grid: [9, 9, 0], size: [0, 1, 1], typeId: 'gallery' }), 'invalid-size');
    expectDiagnostic(await run({ op: 'add-node', id: 'n', grid: [9, 9, 0], size: [1.5, 1, 1], typeId: 'gallery' }), 'invalid-size');
  });

  it('adds a multi-cell room with the next display id', async () => {
    const project = await transforming([{ op: 'add-node', id: 'n', grid: [5, 0, 0], size: [2, 3, 1], typeId: 'gallery' }]);
    const outcome = expectExtOk(runAlgorithmV2(labV2(), project, 't'));
    expect(outcome.kind === 'transformation' && outcome.preview.after.nodes.at(-1)).toEqual({
      id: 'n',
      displayId: '04',
      grid: [5, 0, 0],
      size: [2, 3, 1],
      typeId: 'gallery',
      attributes: {},
    });
    expect(outcome.kind === 'transformation' && outcome.preview.displacedRoutes).toEqual([]);
  });

  it('reports (never silently fills) generated connector cells taken by a new room', async () => {
    const withRoute = expectOk(
      validateDocumentV2({ ...labV2(), edges: [...labV2().edges, { id: 'e2', source: 'g1', target: 's1', kind: 'access', attributes: {} }] }),
    );
    const route = resolveRelationships(withRoute).byEdge.get('e2')!;
    expect(route.status).toBe('routed');
    const cell = route.status === 'routed' ? route.route.cells[0]! : ([0, 0, 0] as const);
    const project = await transforming([{ op: 'add-node', id: 'n', grid: cell, typeId: 'gallery' }]);
    const outcome = expectExtOk(runAlgorithmV2(withRoute, project, 't'));
    expect(outcome.kind === 'transformation' && outcome.preview.displacedRoutes).toEqual(['e2']);
  });

  it('never mutates the input document', async () => {
    const doc = labV2();
    const before = JSON.stringify(doc);
    const project = await transforming([
      { op: 'add-node', id: 'n', grid: [5, 0, 0], typeId: 'gallery' },
      { op: 'set-node-attribute', nodeId: 'g2', key: 'daylight', value: 'low' },
    ]);
    expectExtOk(runAlgorithmV2(doc, project, 't'));
    expect(JSON.stringify(doc)).toBe(before);
  });
});

describe('the gallery test toolkit on schema v2', () => {
  let toolkit: ActiveToolkit;
  beforeAll(async () => {
    toolkit = await galleryToolkit();
  });
  const design = () => expectOk(readDesignJson(TWO_STOREY_TEXT)).doc;

  it('access-depth counts relationship steps from the entrance', () => {
    expect(expectExtOk(runAlgorithmV2(design(), toolkit, 'access-depth'))).toEqual({
      kind: 'analysis',
      result: {
        kind: 'analysis',
        summary: '0 room(s) cannot be reached from "entry-gallery".',
        nodeValues: { 'entry-gallery': 0, 'studio-ground': 1, 'reading-gallery': 1, store: 2, 'studio-upper': 1, 'gallery-upper': 2 },
      },
    });
  });

  it('connect-storage-to-galleries adds the one missing access relationship (store – reading gallery)', () => {
    const outcome = expectExtOk(runAlgorithmV2(design(), toolkit, 'connect-storage-to-galleries'));
    if (outcome.kind !== 'transformation') throw new Error('expected a transformation');
    expect(outcome.preview.after.edges.at(-1)).toEqual({ id: 'door-1', source: 'store', target: 'reading-gallery', kind: 'access', attributes: {} });
    expect(resolveRelationships(outcome.preview.after).byEdge.get('door-1')!.status).toBe('direct');
    const again = expectExtOk(runAlgorithmV2(outcome.preview.after, toolkit, 'connect-storage-to-galleries'));
    expect(again.kind === 'transformation' && again.preview.operations).toEqual([]);
  });

  it('daylight-from-exposure changes only the entry gallery (two exposed walls → medium)', () => {
    const outcome = expectExtOk(runAlgorithmV2(design(), toolkit, 'daylight-from-exposure'));
    if (outcome.kind !== 'transformation') throw new Error('expected a transformation');
    expect(outcome.preview.operations).toEqual([{ op: 'set-node-attribute', nodeId: 'entry-gallery', key: 'daylight', value: 'medium' }]);
  });

  it('never changes the design it ran on', () => {
    const doc = design();
    const before = JSON.stringify(doc);
    for (const a of toolkit.algorithms) runAlgorithmV2(doc, toolkit, a.id);
    expect(JSON.stringify(doc)).toBe(before);
    expect(validateDocumentV2(doc).ok).toBe(true);
  });
});
