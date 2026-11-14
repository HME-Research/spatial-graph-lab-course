import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, serializeDesign, validateDocument, type DesignDocument } from '@app/document';
import { expectOk } from '@app/document/test-fixtures';
import {
  defineGraphAlgorithm,
  defineNodeType,
  defineSpatialAlgorithm,
  FACE_DIRECTIONS,
  getNode,
  neighbourCell,
  neighbours,
  uniqueId,
  type AnalysisResult,
  type Graph,
  type GraphAlgorithmContext,
  type SpatialAlgorithmContext,
  type SpatialOperation,
} from '@student-api';
import type { ActiveProject } from './activate';
import { applyTransformation } from './transform';
import { runAlgorithm, type RunOutcome } from './run';
import { expectDiagnostic, expectExtOk, galleryType, labDoc, labProject } from './test-fixtures';

const ALG = 'projects/lab/algorithms/t.ts';

/** A lab project whose single algorithm `t` returns `operations` (spatial). */
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

function preview(outcome: RunOutcome) {
  if (outcome.kind !== 'transformation') throw new Error('expected a transformation');
  return outcome.preview;
}

/** Runs `t` and asserts the given document was not changed in any way. */
function runUnchanged(doc: DesignDocument, project: ActiveProject, params?: unknown) {
  const before = serializeDesign(doc);
  const snapshot = structuredClone(doc);
  const result = runAlgorithm(doc, project, 't', params);
  expect(serializeDesign(doc)).toBe(before);
  expect(doc).toEqual(snapshot);
  return result;
}

describe('generic graph analysis', () => {
  const depth = defineGraphAlgorithm({
    id: 't',
    label: 'Depth',
    parameters: { start: { kind: 'text', default: 'g1' } },
    run: ({ graph, params }) => {
      const seen = new Map([[params.start ?? '', 0]]);
      const queue = [params.start ?? ''];
      while (queue.length) {
        const id = queue.shift()!;
        for (const n of neighbours(graph, id)) if (!seen.has(n)) (seen.set(n, seen.get(id)! + 1), queue.push(n));
      }
      return { kind: 'analysis', nodeValues: Object.fromEntries(graph.nodes.map((n) => [n.id, seen.get(n.id) ?? null])) };
    },
  });

  it('sees only ids, endpoints and the policy — no spatial or typed fields', async () => {
    let seen: GraphAlgorithmContext | undefined;
    const project = await labProject({
      [ALG]: { default: defineGraphAlgorithm({ id: 't', label: 'T', run: (ctx) => ((seen = ctx), { kind: 'analysis', nodeValues: {} }) }) },
    });
    expectExtOk(runUnchanged(labDoc(), project));
    expect(seen!.graph.nodes.every((n) => Object.keys(n).join() === 'id')).toBe(true);
    expect(seen!.graph.edges.every((e) => Object.keys(e).sort().join() === 'id,source,target')).toBe(true);
    expect(Object.keys(seen!.graph).sort()).toEqual(['edges', 'nodes', 'policy']);
    expect(seen!.graph.policy.directed).toBe(false);
  });

  it('runs on the design and returns validated node values', async () => {
    const project = await labProject({ [ALG]: { default: depth } });
    const outcome = expectExtOk(runUnchanged(labDoc(), project));
    expect(outcome).toEqual({ kind: 'analysis', result: { kind: 'analysis', nodeValues: { g1: 0, g2: 1, s1: 1, k1: null } } });
    const fromS1 = expectExtOk(runAlgorithm(labDoc(), project, 't', { start: 's1' })).kind === 'analysis';
    expect(fromS1).toBe(true);
  });

  it('the same algorithm works on an arbitrary non-spatial graph (directed, self-loop, no typed fields)', () => {
    const social: Graph = {
      policy: { directed: true, allowSelfLoops: true, allowParallelEdges: true },
      nodes: [{ id: 'ann' }, { id: 'bo' }],
      edges: [
        { id: 'f1', source: 'ann', target: 'bo' },
        { id: 'f2', source: 'bo', target: 'bo' },
      ],
    };
    const result = depth.run({ graph: social, params: { start: 'ann' } }) as AnalysisResult;
    expect(result.nodeValues).toEqual({ ann: 0, bo: 1 });
  });

  it('rejects analysis values for nodes that do not exist', async () => {
    const project = await labProject({
      [ALG]: { default: defineGraphAlgorithm({ id: 't', label: 'T', run: () => ({ kind: 'analysis', nodeValues: { ghost: 1 } }) }) },
    });
    expectDiagnostic(runUnchanged(labDoc(), project), 'unknown-node-reference');
  });

  it('a graph algorithm may not return a transformation', async () => {
    const run = () => ({ kind: 'transformation', operations: [] }) as unknown as AnalysisResult;
    const project = await labProject({ [ALG]: { default: defineGraphAlgorithm({ id: 't', label: 'T', run }) } });
    expect(expectDiagnostic(runUnchanged(labDoc(), project), 'invalid-result').message).toContain('graph algorithms must return');
  });
});

describe('spatial algorithm input', () => {
  it('exposes the document records unchanged, including edge attributes', async () => {
    let seen: SpatialAlgorithmContext | undefined;
    const project = await transforming((ctx) => ((seen = ctx), []));
    const doc = labDoc();
    expectExtOk(runAlgorithm(doc, project, 't'));
    expect(seen!.design.nodes).toEqual(doc.nodes);
    expect(seen!.design.edges).toEqual(doc.edges);
    expect(seen!.design.edges.find((e) => e.id === 'e1')!.attributes).toEqual({ width: 0.9 });
    expect(seen!.design.nodes).not.toBe(doc.nodes); // a copy
    expect(seen!.nodeAt([1, 0, 0])).toBe('g2');
    expect(seen!.nodeAt([2, 0, 0])).toBeUndefined();
    expect(seen!.canConnect('door', [0, 0, 0], [2, 0, 0])).toBe(false);
    expect(seen!.canConnect('atrium', [0, 0, 0], [0, 0, 1])).toBe(true);
    expect(seen!.canConnect('stair' as never, [0, 0, 0], [0, 0, 1])).toBe(false);
  });

  it('typed attributes: effective values with defaults; invalid stored values read as default/undefined', async () => {
    let read: unknown[] = [];
    const project = await transforming((ctx) => {
      read = ctx.design.nodes.filter((n) => n.typeId === 'gallery').map((n) => ctx.attributesOf(n, galleryType));
      return [];
    });
    expectExtOk(runAlgorithm(labDoc(), project, 't'));
    expect(read).toEqual([{ daylight: 'high', public: true }, { public: true }]);
  });

  it('attributesOf rejects unregistered, mismatched and broken definitions', async () => {
    const stranger = defineNodeType({ id: 'gallery', label: 'Not registered' });
    const project = await transforming((ctx) => (ctx.attributesOf(ctx.design.nodes[0]!, stranger), []));
    expectDiagnostic(runAlgorithm(labDoc(), project, 't'), 'type-not-registered');

    const mismatch = await transforming((ctx) => (ctx.attributesOf(getNode(ctx.design, 's1')!, galleryType), []));
    expectDiagnostic(runAlgorithm(labDoc(), mismatch, 't'), 'type-mismatch');

    const brokenDef = { id: 'gallery', label: 'G', attributes: { daylight: { kind: 'enum', values: [] } } };
    const broken = await labProject({
      'projects/lab/types/gallery.ts': { default: brokenDef },
      [ALG]: {
        default: defineSpatialAlgorithm({
          id: 't',
          label: 'T',
          run: (ctx) => (ctx.attributesOf(ctx.design.nodes[0]!, brokenDef as never), { kind: 'transformation', operations: [] }),
        }),
      },
    });
    expectDiagnostic(runAlgorithm(labDoc(), broken, 't'), 'broken-node-type');
  });

  it('mutation attempts on the input fail the run loudly and never reach the document', async () => {
    const project = await transforming((ctx) => {
      (ctx.design.nodes[0]!.attributes as Record<string, unknown>).daylight = 'low';
      return [];
    });
    expect(expectDiagnostic(runUnchanged(labDoc(), project), 'run-failed').message).toContain('TypeError');
  });
});

describe('add-node', () => {
  it('creates a node at an explicit free cell with a registered type and typed attributes', async () => {
    const project = await transforming([{ op: 'add-node', id: 'g3', grid: [2, 0, 0], typeId: 'gallery', attributes: { daylight: 'low' } }]);
    const doc = labDoc();
    const p = preview(expectExtOk(runUnchanged(doc, project)));
    expect(p.before).toBe(doc);
    expect(p.after.nodes.at(-1)).toEqual({ id: 'g3', grid: [2, 0, 0], typeId: 'gallery', attributes: { daylight: 'low' } });
    expect(p.after.diagram.positions).toEqual(doc.diagram.positions); // Graph 2D uses its fallback position
    expect(p.after.nodes).toHaveLength(doc.nodes.length + 1);
  });

  it('does not write defaults for omitted attributes', async () => {
    const project = await transforming([{ op: 'add-node', id: 's2', grid: [0, 2, 0], typeId: 'studio' }]);
    expect(preview(expectExtOk(runAlgorithm(labDoc(), project, 't'))).after.nodes.at(-1)!.attributes).toEqual({});
  });

  it.each<[string, SpatialOperation, Parameters<typeof expectDiagnostic>[1]]>([
    ['an occupied cell', { op: 'add-node', id: 'n', grid: [1, 0, 0], typeId: 'gallery' }, 'occupied-cell'],
    ['a duplicate id', { op: 'add-node', id: 'g1', grid: [3, 0, 0], typeId: 'gallery' }, 'duplicate-node-id'],
    ['an invalid id', { op: 'add-node', id: 'bad id', grid: [3, 0, 0], typeId: 'gallery' }, 'invalid-id'],
    ['a non-integer cell', { op: 'add-node', id: 'n', grid: [0.5, 0, 0], typeId: 'gallery' }, 'invalid-grid'],
    ['an out-of-range cell', { op: 'add-node', id: 'n', grid: [5000, 0, 0], typeId: 'gallery' }, 'invalid-grid'],
    ['an unregistered type', { op: 'add-node', id: 'n', grid: [3, 0, 0], typeId: 'kiosk' }, 'type-not-registered'],
    ['an undeclared attribute', { op: 'add-node', id: 'n', grid: [3, 0, 0], typeId: 'gallery', attributes: { colour: 'red' } }, 'undeclared-attribute-write'],
    ['an invalid enum value', { op: 'add-node', id: 'n', grid: [3, 0, 0], typeId: 'gallery', attributes: { daylight: 'bright' } }, 'invalid-attribute-value'],
    ['a number below min', { op: 'add-node', id: 'n', grid: [3, 0, 0], typeId: 'studio', attributes: { occupancy: -1 } }, 'invalid-attribute-value'],
    ['a wrong primitive', { op: 'add-node', id: 'n', grid: [3, 0, 0], typeId: 'studio', attributes: { public: 'yes' } }, 'invalid-attribute-value'],
  ])('rejects %s and leaves the document unchanged', async (_name, op, code) => {
    const project = await transforming([op]);
    const d = expectDiagnostic(runUnchanged(labDoc(), project), code);
    expect(d.subject).toEqual({ kind: 'operation', index: 0 });
    expect(d.severity).toBe('error');
  });

  it('rejects a type whose definition is broken', async () => {
    const project = await labProject({
      'projects/lab/types/studio.ts': { default: { id: 'studio', label: 'S', facade: { windowFraction: -1 } } },
      [ALG]: {
        default: defineSpatialAlgorithm({
          id: 't',
          label: 'T',
          run: () => ({ kind: 'transformation', operations: [{ op: 'add-node', id: 'n', grid: [3, 0, 0], typeId: 'studio' }] }),
        }),
      },
    });
    expectDiagnostic(runUnchanged(labDoc(), project), 'broken-node-type');
  });
});

describe('atomic transformations', () => {
  it('add-node followed by add-edge to the new node is one valid transformation', async () => {
    const project = await transforming([
      { op: 'add-node', id: 'g3', grid: [2, 0, 0], typeId: 'gallery' },
      { op: 'add-edge', id: 'e3', source: 'g2', target: 'g3', kind: 'door' },
    ]);
    const p = preview(expectExtOk(runUnchanged(labDoc(), project)));
    expect(p.after.edges.at(-1)).toEqual({ id: 'e3', source: 'g2', target: 'g3', kind: 'door', attributes: {} });
  });

  it('operations are ordered: an edge to a node added later is rejected', async () => {
    const project = await transforming([
      { op: 'add-edge', id: 'e3', source: 'g2', target: 'g3', kind: 'door' },
      { op: 'add-node', id: 'g3', grid: [2, 0, 0], typeId: 'gallery' },
    ]);
    expect(expectDiagnostic(runUnchanged(labDoc(), project), 'missing-node').subject).toEqual({ kind: 'operation', index: 0 });
  });

  it('a failure in a later operation discards the earlier ones and keeps the original document', async () => {
    const project = await transforming([
      { op: 'add-node', id: 'g3', grid: [2, 0, 0], typeId: 'gallery' },
      { op: 'add-edge', id: 'e3', source: 'g1', target: 'g3', kind: 'door' }, // not adjacent
    ]);
    const d = expectDiagnostic(runUnchanged(labDoc(), project), 'invalid-edge-geometry');
    expect(d.subject).toEqual({ kind: 'operation', index: 1 });
  });

  it('applyTransformation never mutates its input, on success or failure', async () => {
    const project = await labProject();
    const doc = labDoc();
    const before = serializeDesign(doc);
    expectExtOk(applyTransformation(doc, project, [{ op: 'add-node', id: 'g3', grid: [2, 0, 0], typeId: 'gallery' }]));
    expect(applyTransformation(doc, project, [{ op: 'add-node', id: 'g3', grid: [1, 0, 0], typeId: 'gallery' }]).ok).toBe(false);
    expect(serializeDesign(doc)).toBe(before);
  });

  it('the final schema-v1 validation is authoritative (e.g. the node limit)', async () => {
    const project = await labProject();
    const full = expectOk(
      validateDocument({
        schemaVersion: 1,
        metadata: { name: 'Full' },
        nodes: Array.from({ length: DEFAULT_LIMITS.maxNodes }, (_, i) => ({
          id: `n${i}`,
          grid: [i % 50, Math.floor(i / 50), 0],
          typeId: 'studio',
          attributes: {},
        })),
        edges: [],
      }),
    );
    const result = applyTransformation(full, project, [{ op: 'add-node', id: 'extra', grid: [0, 0, 1], typeId: 'studio' }]);
    expect(expectDiagnostic(result, 'final-document-invalid').message).toContain('too-many-nodes');
    expect(full.nodes).toHaveLength(DEFAULT_LIMITS.maxNodes);
  });

  it.each<[string, SpatialOperation, Parameters<typeof expectDiagnostic>[1]]>([
    ['a new edge kind', { op: 'add-edge', id: 'x', source: 'g2', target: 's1', kind: 'stair' as never }, 'unknown-edge-kind'],
    ['a duplicate edge id', { op: 'add-edge', id: 'e1', source: 'g2', target: 's1', kind: 'door' }, 'duplicate-edge-id'],
    ['a self edge', { op: 'add-edge', id: 'x', source: 'g1', target: 'g1', kind: 'door' }, 'self-edge'],
    ['a duplicate relationship', { op: 'add-edge', id: 'x', source: 'g2', target: 'g1', kind: 'open' }, 'duplicate-relationship'],
    ['a missing endpoint', { op: 'add-edge', id: 'x', source: 'g1', target: 'ghost', kind: 'door' }, 'missing-node'],
    ['wrong geometry for the kind', { op: 'add-edge', id: 'x', source: 'g2', target: 's1', kind: 'door' }, 'invalid-edge-geometry'],
  ])('add-edge rejects %s', async (_name, op, code) => {
    expectDiagnostic(runUnchanged(labDoc(), await transforming([op])), code);
  });
});

describe('set-node-attribute and conformance non-regression', () => {
  it('replacing an invalid stored value with a valid one resolves its diagnostic and keeps legacy attributes', async () => {
    const project = await transforming([{ op: 'set-node-attribute', nodeId: 'g2', key: 'daylight', value: 'medium' }]);
    const p = preview(expectExtOk(runUnchanged(labDoc(), project)));
    expect(p.after.nodes.find((n) => n.id === 'g2')!.attributes).toEqual({ daylight: 'medium', legacy: 'kept' });
    expect(p.resolvedDiagnosticIds).toEqual(['invalid-attribute-value|node:g2|daylight']);
  });

  it('writing a missing declared attribute or null is allowed', async () => {
    const project = await transforming([
      { op: 'set-node-attribute', nodeId: 's1', key: 'public', value: true },
      { op: 'set-node-attribute', nodeId: 'g1', key: 'daylight', value: null },
    ]);
    const p = preview(expectExtOk(runAlgorithm(labDoc(), project, 't')));
    expect(p.after.nodes.find((n) => n.id === 's1')!.attributes).toEqual({ occupancy: 4, public: true });
    expect(p.after.nodes.find((n) => n.id === 'g1')!.attributes).toEqual({ daylight: null, public: true });
  });

  it.each<[string, SpatialOperation, Parameters<typeof expectDiagnostic>[1]]>([
    ['an undeclared (legacy) attribute', { op: 'set-node-attribute', nodeId: 'g2', key: 'legacy', value: 'x' }, 'undeclared-attribute-write'],
    ['an invalid value', { op: 'set-node-attribute', nodeId: 'g1', key: 'daylight', value: 'bright' }, 'invalid-attribute-value'],
    ['a node of an undefined type', { op: 'set-node-attribute', nodeId: 'k1', key: 'x', value: 1 }, 'type-not-registered'],
    ['a missing node', { op: 'set-node-attribute', nodeId: 'ghost', key: 'daylight', value: 'low' }, 'missing-node'],
  ])('rejects writing %s', async (_name, op, code) => {
    expectDiagnostic(runUnchanged(labDoc(), await transforming([op])), code);
  });

  it('pre-existing problems are tolerated: unrelated transformations still succeed', async () => {
    const project = await transforming([{ op: 'add-node', id: 'g3', grid: [2, 0, 0], typeId: 'gallery' }]);
    const p = preview(expectExtOk(runAlgorithm(labDoc(), project, 't')));
    expect(p.resolvedDiagnosticIds).toEqual([]);
    expect(p.after.nodes.find((n) => n.id === 'g2')!.attributes).toEqual({ daylight: 'bright', legacy: 'kept' });
  });
});

describe('result and parameter validation', () => {
  it.each<[string, () => unknown, Parameters<typeof expectDiagnostic>[1]]>([
    ['throws', () => { throw new Error('boom'); }, 'run-failed'],
    ['returns undefined', () => undefined, 'invalid-result'],
    ['returns an analysis', () => ({ kind: 'analysis', nodeValues: {} }), 'invalid-result'],
    ['returns an unknown op', () => ({ kind: 'transformation', operations: [{ op: 'remove-node', nodeId: 'g1' }] }), 'invalid-result'],
    ['returns extra fields', () => ({ kind: 'transformation', operations: [], extra: 1 }), 'invalid-result'],
    ['returns a non-primitive value', () => ({ kind: 'transformation', operations: [{ op: 'set-node-attribute', nodeId: 'g1', key: 'daylight', value: { a: 1 } }] }), 'invalid-result'],
  ])('a spatial algorithm that %s is rejected', async (_name, run, code) => {
    const project = await labProject({ [ALG]: { default: { id: 't', label: 'T', scope: 'spatial', run } } });
    expectDiagnostic(runUnchanged(labDoc(), project), code);
  });

  it('changes the algorithm makes to its own result afterwards have no effect', async () => {
    const ops: SpatialOperation[] = [{ op: 'add-node', id: 'g3', grid: [2, 0, 0], typeId: 'gallery' }];
    const project = await transforming(() => ops);
    const p = preview(expectExtOk(runAlgorithm(labDoc(), project, 't')));
    ops.push({ op: 'add-node', id: 'g4', grid: [3, 0, 0], typeId: 'gallery' });
    (ops[0] as { id: string }).id = 'changed';
    expect(p.operations).toEqual([{ op: 'add-node', id: 'g3', grid: [2, 0, 0], typeId: 'gallery' }]);
    expect(p.after.nodes.at(-1)!.id).toBe('g3');
  });

  it('validates parameters and applies defaults', async () => {
    let params: unknown;
    const project = await labProject({
      [ALG]: {
        default: defineSpatialAlgorithm({
          id: 't',
          label: 'T',
          parameters: { count: { kind: 'number', min: 1, default: 2 }, mode: { kind: 'enum', values: ['a', 'b'] } },
          run: (ctx) => ((params = ctx.params), { kind: 'transformation', operations: [] }),
        }),
      },
    });
    expectExtOk(runAlgorithm(labDoc(), project, 't'));
    expect(params).toEqual({ count: 2 });
    expectExtOk(runAlgorithm(labDoc(), project, 't', { count: 5, mode: 'b' }));
    expect(params).toEqual({ count: 5, mode: 'b' });
    expectDiagnostic(runAlgorithm(labDoc(), project, 't', { count: 0 }), 'invalid-parameter');
    expectDiagnostic(runAlgorithm(labDoc(), project, 't', { other: 1 }), 'invalid-parameter');
    expectDiagnostic(runAlgorithm(labDoc(), project, 't', 'x'), 'invalid-parameter');
  });

  it('reports unknown and disabled algorithms', async () => {
    const project = await labProject({ [ALG]: { default: { id: 't', label: 'T', run: () => null } } });
    expectDiagnostic(runAlgorithm(labDoc(), project, 'nope'), 'unknown-algorithm');
    expectDiagnostic(runAlgorithm(labDoc(), project, 't'), 'algorithm-disabled');
  });
});

describe('future student exercise (written only against @student-api)', () => {
  /** "Find a free adjacent cell, add a new gallery node and connect it by a door to an existing gallery." */
  const extendGallery = defineSpatialAlgorithm({
    id: 't',
    label: 'Extend a gallery',
    run(ctx) {
      const galleries = ctx.design.nodes.filter((n) => n.typeId === galleryType.id).sort((a, b) => (a.id < b.id ? -1 : 1));
      for (const existing of galleries) {
        for (const direction of FACE_DIRECTIONS.filter((d) => d !== '+z' && d !== '-z')) {
          const cell = neighbourCell(existing.grid, direction);
          if (ctx.nodeAt(cell) !== undefined || !ctx.canConnect('door', existing.grid, cell)) continue;
          const nodeId = uniqueId(ctx.design, 'gallery');
          const edgeId = uniqueId(ctx.design, 'door', [nodeId]);
          return {
            kind: 'transformation',
            operations: [
              { op: 'add-node', id: nodeId, grid: cell, typeId: galleryType.id, attributes: { daylight: 'medium' } },
              { op: 'add-edge', id: edgeId, source: existing.id, target: nodeId, kind: 'door' },
            ],
          };
        }
      }
      return { kind: 'transformation', summary: 'No free cell next to a gallery.', operations: [] };
    },
  });

  it('is supported atomically by the current API', async () => {
    const project = await labProject({ [ALG]: { default: extendGallery } });
    const p = preview(expectExtOk(runUnchanged(labDoc(), project)));
    expect(p.after.nodes.at(-1)).toEqual({ id: 'gallery-1', grid: [-1, 0, 0], typeId: 'gallery', attributes: { daylight: 'medium' } });
    expect(p.after.edges.at(-1)).toEqual({ id: 'door-1', source: 'g1', target: 'gallery-1', kind: 'door', attributes: {} });
  });
});
