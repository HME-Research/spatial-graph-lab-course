import { beforeAll, describe, expect, it } from 'vitest';
import { parseDesignJson } from '@app/document';
import { expectOk } from '@app/document/test-fixtures';
import { migrateV1toV2, readDesignJson, validateDocumentV2, type DesignDocumentV2 } from '@app/document/v2';
import { resolveRelationships } from '@app/spatial';
import { defineSpatialAlgorithm, roomCells, type SpatialAlgorithmContext, type SpatialOperation } from '@student-api';
import builtInText from '../document/examples/two-storey-example.json?raw';
import { activate, type ActiveProject } from './activate';
import { PROJECT_GLOBS } from './projectGlobs';
import { runAlgorithm, runAlgorithmV2 } from './run';
import { expectDiagnostic, expectExtOk, labDoc, labProject } from './test-fixtures';

/**
 * Student API on schema v2 (docs/CONTRACTS-V2.md §7): the shipped example algorithms keep
 * working on v2 documents, legacy kinds are mapped, the new queries are distinct from the
 * deprecated `canConnect`, and transformations are validated with `validateDocumentV2`.
 */

const ALG = 'projects/lab/algorithms/t.ts';

async function transforming(operations: readonly SpatialOperation[] | ((ctx: SpatialAlgorithmContext) => readonly SpatialOperation[])) {
  return labProject({
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
  it('nodeAt uses footprints; touches and canRelate are distinct from the deprecated canConnect', async () => {
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
    // canConnect keeps its v1 cell meaning.
    expect(ctx.canConnect('door', [1, 1, 0], [2, 1, 0])).toBe(true);
    expect(ctx.canConnect('door', [0, 0, 0], [0, 5, 0])).toBe(false);
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

  it.each([
    ['door', 'access'],
    ['vertical-access', 'access'],
    ['open', 'open'],
    ['atrium', 'open'],
  ] as const)('maps the legacy kind %s to %s', async (legacy, kind) => {
    const project = await transforming([{ op: 'add-edge', id: 'e2', source: 'g1', target: 's1', kind: legacy }]);
    const outcome = expectExtOk(runAlgorithmV2(labV2(), project, 't'));
    expect(outcome.kind === 'transformation' && outcome.preview.after.edges.at(-1)!.kind).toBe(kind);
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

describe('v1 runner compatibility with the v2 Student API', () => {
  it('maps access to door / vertical-access on touching rooms and refuses non-touching rooms', async () => {
    const run = async (op: SpatialOperation) => runAlgorithm(labDoc(), await transforming([op]), 't');
    // labDoc: g1 [0,0,0], g2 [1,0,0] (related), s1 [0,1,0] (related), k1 [5,5,0].
    const add = await run({ op: 'add-node', id: 'up', grid: [1, 0, 1], typeId: 'gallery' });
    expect(add.ok).toBe(true);
    const door = await transforming([
      { op: 'add-node', id: 'n', grid: [2, 0, 0], typeId: 'gallery' },
      { op: 'add-node', id: 'up', grid: [2, 0, 1], typeId: 'gallery' },
      { op: 'add-edge', id: 'x1', source: 'g2', target: 'n', kind: 'access' },
      { op: 'add-edge', id: 'x2', source: 'n', target: 'up', kind: 'access' },
    ]);
    const outcome = expectExtOk(runAlgorithm(labDoc(), door, 't'));
    expect(outcome.kind === 'transformation' && outcome.preview.after.edges.slice(-2).map((e) => e.kind)).toEqual(['door', 'vertical-access']);
    expectDiagnostic(await run({ op: 'add-edge', id: 'x', source: 'g1', target: 'k1', kind: 'access' }), 'invalid-edge-geometry');
    expectDiagnostic(await run({ op: 'add-node', id: 'n', grid: [9, 9, 0], size: [2, 1, 1], typeId: 'gallery' }), 'invalid-size');
    expect((await run({ op: 'add-node', id: 'n', grid: [9, 9, 0], size: [1, 1, 1], typeId: 'gallery' })).ok).toBe(true);
  });
});

describe('shipped projects on schema v2', () => {
  let projects: Record<string, ActiveProject>;
  beforeAll(async () => {
    projects = {};
    for (const query of ['example-gallery', 'starter-template']) {
      const { activation } = await activate(PROJECT_GLOBS, { query });
      if (activation.status !== 'active') throw new Error(`${query} did not activate`);
      projects[query] = activation.project;
    }
  });
  const exampleV1 = () => expectOk(parseDesignJson(builtInText));
  const exampleV2 = () => expectOk(readDesignJson(builtInText)).doc;
  const starterV1 = () => {
    const design = projects['starter-template']!.designs.find((d) => d.id === 'starter')!;
    if (!design.result.ok) throw new Error('starter design invalid');
    return design.result.value;
  };

  it('access-depth gives the same analysis on v1 and v2', () => {
    const p = projects['example-gallery']!;
    expect(expectExtOk(runAlgorithmV2(exampleV2(), p, 'access-depth'))).toEqual(expectExtOk(runAlgorithm(exampleV1(), p, 'access-depth')));
  });

  it('connect-storage-to-galleries runs unchanged and stores an access relationship', () => {
    const p = projects['example-gallery']!;
    const v1 = expectExtOk(runAlgorithm(exampleV1(), p, 'connect-storage-to-galleries'));
    const v2 = expectExtOk(runAlgorithmV2(exampleV2(), p, 'connect-storage-to-galleries'));
    if (v1.kind !== 'transformation' || v2.kind !== 'transformation') throw new Error('expected transformations');
    expect(v2.preview.operations).toEqual(v1.preview.operations);
    expect(v2.preview.after.edges.at(-1)).toEqual({ id: 'door-1', source: 'store', target: 'reading-gallery', kind: 'access', attributes: {} });
    // The v2 result equals migrating the v1 result (kinds, ids, attributes); display ids are kept.
    expect(v2.preview.after.edges).toEqual(migrateV1toV2(v1.preview.after).edges);
    expect(resolveRelationships(v2.preview.after).byEdge.get('door-1')!.status).toBe('direct');
    const again = expectExtOk(runAlgorithmV2(v2.preview.after, p, 'connect-storage-to-galleries'));
    expect(again.kind === 'transformation' && again.preview.operations).toEqual([]);
  });

  it('daylight-from-exposure gives the same operations on v1 and v2', () => {
    const p = projects['example-gallery']!;
    const v1 = expectExtOk(runAlgorithm(exampleV1(), p, 'daylight-from-exposure'));
    const v2 = expectExtOk(runAlgorithmV2(exampleV2(), p, 'daylight-from-exposure'));
    expect(v2.kind === 'transformation' && v2.preview.operations).toEqual(v1.kind === 'transformation' && v1.preview.operations);
  });

  it.each(['door', 'open'])('starter connect-neighbours (%s) gives the same operations on v1 and v2', (kind) => {
    const p = projects['starter-template']!;
    const v1 = expectExtOk(runAlgorithm(starterV1(), p, 'connect-neighbours', { kind }));
    const v2 = expectExtOk(runAlgorithmV2(migrateV1toV2(starterV1()), p, 'connect-neighbours', { kind }));
    if (v1.kind !== 'transformation' || v2.kind !== 'transformation') throw new Error('expected transformations');
    expect(v2.preview.operations).toEqual(v1.preview.operations);
    expect(v2.preview.after.edges).toEqual(migrateV1toV2(v1.preview.after).edges);
  });

  it('count-connections gives the same analysis on v1 and v2', () => {
    const p = projects['starter-template']!;
    const v1 = expectExtOk(runAlgorithm(starterV1(), p, 'count-connections'));
    const v2 = expectExtOk(runAlgorithmV2(migrateV1toV2(starterV1()), p, 'count-connections'));
    expect(v2).toEqual(v1);
  });
});

