import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, type DesignDocumentV2, serializeDesignV2, validateDocumentV2 } from '@app/document';
import { expectOk } from '@app/document/test-fixtures';
import {
  defineGraphAlgorithm,
  defineNodeType,
  defineSpatialAlgorithm,
  edgesBetween,
  FACE_DIRECTIONS,
  getNode,
  neighbourCell,
  neighbours,
  type AnalysisResult,
  type Graph,
  type GraphAlgorithmContext,
  type SpatialAlgorithmContext,
  type SpatialOperation,
} from '@student-api';
import type { ActiveToolkit } from './activate';
import { applyTransformationV2 } from './transformV2';
import { runAlgorithmV2, type RunOutcomeV2 } from './run';
import { expectDiagnostic, expectExtOk, galleryType, labDoc, labToolkit } from './test-fixtures';

const ALG = 'toolkits/lab/algorithms/t.ts';

// labDoc(): galleries 1 [0,0,0] and 2 [1,0,0], studio 3 [0,1,0], kiosk 4; edges 1 (1–2 access), 2 (1–3 open).

/** A lab project whose single algorithm `t` returns `operations` (spatial). */
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

function preview(outcome: RunOutcomeV2) {
  if (outcome.kind !== 'transformation') throw new Error('expected a transformation');
  return outcome.preview;
}

/** Runs `t` and asserts the given document was not changed in any way. */
function runUnchanged(doc: DesignDocumentV2, project: ActiveToolkit, params?: unknown) {
  const before = serializeDesignV2(doc);
  const snapshot = structuredClone(doc);
  const result = runAlgorithmV2(doc, project, 't', params);
  expect(serializeDesignV2(doc)).toBe(before);
  expect(doc).toEqual(snapshot);
  return result;
}

describe('generic graph analysis', () => {
  const depth = defineGraphAlgorithm({
    id: 't',
    label: 'Depth',
    inputs: [{ kind: 'node', label: 'Start' }],
    run: ({ graph, inputs }) => {
      const seen = new Map([[inputs[0] ?? -1, 0]]);
      const queue = [inputs[0] ?? -1];
      while (queue.length) {
        const id = queue.shift()!;
        for (const n of neighbours(graph, id)) if (!seen.has(n)) (seen.set(n, seen.get(id)! + 1), queue.push(n));
      }
      return { kind: 'analysis', nodeValues: Object.fromEntries(graph.nodes.map((n) => [n.id, seen.get(n.id) ?? null])) };
    },
  });

  it('sees only ids, endpoints and the policy — no spatial or typed fields', async () => {
    let seen: GraphAlgorithmContext | undefined;
    const project = await labToolkit({
      [ALG]: { default: defineGraphAlgorithm({ id: 't', label: 'T', inputs: [], run: (ctx) => ((seen = ctx), { kind: 'analysis', nodeValues: {} }) }) },
    });
    expectExtOk(runUnchanged(labDoc(), project));
    expect(seen!.graph.nodes.every((n) => Object.keys(n).join() === 'id')).toBe(true);
    expect(seen!.graph.edges.every((e) => Object.keys(e).sort().join() === 'id,source,target')).toBe(true);
    expect(Object.keys(seen!.graph).sort()).toEqual(['edges', 'nodes', 'policy']);
    expect(seen!.graph.policy.directed).toBe(false);
  });

  it('runs on the design and returns validated node values', async () => {
    const project = await labToolkit({ [ALG]: { default: depth } });
    const outcome = expectExtOk(runAlgorithmV2(labDoc(), project, 't', undefined, { inputs: [1] }));
    expect(outcome).toEqual({ kind: 'analysis', result: { kind: 'analysis', nodeValues: { 1: 0, 2: 1, 3: 1, 4: null } } });
    const fromS1 = expectExtOk(runAlgorithmV2(labDoc(), project, 't', undefined, { inputs: [3] })).kind === 'analysis';
    expect(fromS1).toBe(true);
  });

  it('the same algorithm works on an arbitrary non-spatial graph (directed, self-loop, no typed fields)', () => {
    const social: Graph = {
      policy: { directed: true, allowSelfLoops: true, allowParallelEdges: true },
      nodes: [{ id: 1 }, { id: 2 }], // ann, bo
      edges: [
        { id: 1, source: 1, target: 2 },
        { id: 2, source: 2, target: 2 },
      ],
    };
    const result = depth.run({ graph: social, inputs: [1] }) as AnalysisResult;
    expect(result.nodeValues).toEqual({ 1: 0, 2: 1 });
  });

  it('rejects analysis values for nodes that do not exist', async () => {
    const project = await labToolkit({
      [ALG]: { default: defineGraphAlgorithm({ id: 't', label: 'T', inputs: [], run: () => ({ kind: 'analysis', nodeValues: { 99: 1 } }) }) },
    });
    expectDiagnostic(runUnchanged(labDoc(), project), 'unknown-node-reference');
    const named = await labToolkit({
      [ALG]: { default: defineGraphAlgorithm({ id: 't', label: 'T', inputs: [], run: () => ({ kind: 'analysis', nodeValues: { g1: 1 } }) }) },
    });
    expectDiagnostic(runUnchanged(labDoc(), named), 'unknown-node-reference'); // keys are node ids, not names
  });

  it('a graph algorithm may not return a transformation', async () => {
    const run = () => ({ kind: 'transformation', operations: [] }) as unknown as AnalysisResult;
    const project = await labToolkit({ [ALG]: { default: defineGraphAlgorithm({ id: 't', label: 'T', inputs: [], run }) } });
    expect(expectDiagnostic(runUnchanged(labDoc(), project), 'invalid-result').message).toContain('graph algorithms must return');
  });
});

describe('spatial algorithm input', () => {
  it('exposes copies of the document records, including edge attributes', async () => {
    let seen: SpatialAlgorithmContext | undefined;
    const project = await transforming((ctx) => ((seen = ctx), []));
    const doc = labDoc();
    expectExtOk(runAlgorithmV2(doc, project, 't'));
    const v2 = doc;
    expect(seen!.design.nodes).toEqual(v2.nodes);
    expect(seen!.design.edges).toEqual(v2.edges);
    expect(seen!.design.nodes.every((n) => n.size.join() === '1,1,1')).toBe(true);
    expect(seen!.design.edges.every((e) => e.kind === 'access' || e.kind === 'open')).toBe(true);
    expect(seen!.design.edges.find((e) => e.id === 1)!.attributes).toEqual({ width: 0.9 });
    expect(seen!.design.nodes).not.toBe(doc.nodes); // a copy
    expect(seen!.nodeAt([1, 0, 0])).toBe(2);
    expect(seen!.nodeAt([2, 0, 0])).toBeUndefined();
  });

  it('typed attributes: effective values with defaults; invalid stored values read as default/undefined', async () => {
    let read: unknown[] = [];
    const project = await transforming((ctx) => {
      read = ctx.design.nodes.filter((n) => n.typeId === 'gallery').map((n) => ctx.attributesOf(n, galleryType));
      return [];
    });
    expectExtOk(runAlgorithmV2(labDoc(), project, 't'));
    expect(read).toEqual([{ daylight: 'high', public: true }, { public: true }]);
  });

  it('attributesOf rejects unregistered, mismatched and broken definitions', async () => {
    const stranger = defineNodeType({ id: 'gallery', label: 'Not registered' });
    const project = await transforming((ctx) => (ctx.attributesOf(ctx.design.nodes[0]!, stranger), []));
    expectDiagnostic(runAlgorithmV2(labDoc(), project, 't'), 'type-not-registered');

    const mismatch = await transforming((ctx) => (ctx.attributesOf(getNode(ctx.design, 3)!, galleryType), []));
    expectDiagnostic(runAlgorithmV2(labDoc(), mismatch, 't'), 'type-mismatch');

    const brokenDef = { id: 'gallery', label: 'G', attributes: { daylight: { kind: 'enum', values: [] } } };
    const broken = await labToolkit({
      'toolkits/lab/types/gallery.ts': { default: brokenDef },
      [ALG]: {
        default: defineSpatialAlgorithm({
          id: 't',
          label: 'T',
          run: (ctx) => (ctx.attributesOf(ctx.design.nodes[0]!, brokenDef as never), { kind: 'transformation', operations: [] }),
        }),
      },
    });
    expectDiagnostic(runAlgorithmV2(labDoc(), broken, 't'), 'broken-node-type');
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
  it('creates a node at an explicit free cell with a registered type and typed attributes; its id comes from the counter', async () => {
    const project = await transforming([{ op: 'add-node', grid: [2, 0, 0], typeId: 'gallery', attributes: { daylight: 'low' } }]);
    const doc = labDoc();
    const p = preview(expectExtOk(runUnchanged(doc, project)));
    expect(p.before).toBe(doc);
    expect(p.after.nodes.at(-1)).toEqual({ id: 5, grid: [2, 0, 0], size: [1, 1, 1], typeId: 'gallery', attributes: { daylight: 'low' } });
    expect(p.after.diagram.positions).toEqual(doc.diagram.positions); // Graph 2D uses its fallback position
    expect(p.after.nodes).toHaveLength(doc.nodes.length + 1);
    expect([p.after.nextNodeId, p.after.nextEdgeId]).toEqual([doc.nextNodeId + 1, doc.nextEdgeId]);
  });

  it('does not write defaults for omitted attributes', async () => {
    const project = await transforming([{ op: 'add-node', grid: [0, 2, 0], typeId: 'studio' }]);
    expect(preview(expectExtOk(runAlgorithmV2(labDoc(), project, 't'))).after.nodes.at(-1)!.attributes).toEqual({});
  });

  it.each<[string, SpatialOperation, Parameters<typeof expectDiagnostic>[1]]>([
    ['an occupied cell', { op: 'add-node', grid: [1, 0, 0], typeId: 'gallery' }, 'occupied-cell'],
    ['an empty ref', { op: 'add-node', ref: '', grid: [3, 0, 0], typeId: 'gallery' }, 'invalid-id'],
    ['a non-integer cell', { op: 'add-node', grid: [0.5, 0, 0], typeId: 'gallery' }, 'invalid-grid'],
    ['an out-of-range cell', { op: 'add-node', grid: [5000, 0, 0], typeId: 'gallery' }, 'invalid-grid'],
    ['an unregistered type', { op: 'add-node', grid: [3, 0, 0], typeId: 'kiosk' }, 'type-not-registered'],
    ['an undeclared attribute', { op: 'add-node', grid: [3, 0, 0], typeId: 'gallery', attributes: { colour: 'red' } }, 'undeclared-attribute-write'],
    ['an invalid enum value', { op: 'add-node', grid: [3, 0, 0], typeId: 'gallery', attributes: { daylight: 'bright' } }, 'invalid-attribute-value'],
    ['a number below min', { op: 'add-node', grid: [3, 0, 0], typeId: 'studio', attributes: { occupancy: -1 } }, 'invalid-attribute-value'],
    ['a wrong primitive', { op: 'add-node', grid: [3, 0, 0], typeId: 'studio', attributes: { public: 'yes' } }, 'invalid-attribute-value'],
  ])('rejects %s and leaves the document unchanged', async (_name, op, code) => {
    const project = await transforming([op]);
    const d = expectDiagnostic(runUnchanged(labDoc(), project), code);
    expect(d.subject).toEqual({ kind: 'operation', index: 0 });
    expect(d.severity).toBe('error');
  });

  it('refuses a caller-chosen id (ids come from the counter)', async () => {
    const project = await transforming([{ op: 'add-node', id: 7, grid: [3, 0, 0], typeId: 'gallery' } as never]);
    expectDiagnostic(runUnchanged(labDoc(), project), 'invalid-result');
  });

  it('rejects a type whose definition is broken', async () => {
    const project = await labToolkit({
      'toolkits/lab/types/studio.ts': { default: { id: 'studio', label: 'S', facade: { windowFraction: -1 } } },
      [ALG]: {
        default: defineSpatialAlgorithm({
          id: 't',
          label: 'T',
          run: () => ({ kind: 'transformation', operations: [{ op: 'add-node', grid: [3, 0, 0], typeId: 'studio' }] }),
        }),
      },
    });
    expectDiagnostic(runUnchanged(labDoc(), project), 'broken-node-type');
  });
});

describe('atomic transformations', () => {
  it('add-node followed by add-edge to the new node is one valid transformation', async () => {
    const project = await transforming([
      { op: 'add-node', ref: 'g3', grid: [2, 0, 0], typeId: 'gallery' },
      { op: 'add-edge', source: 2, target: 'g3', kind: 'access' },
    ]);
    const p = preview(expectExtOk(runUnchanged(labDoc(), project)));
    expect(p.after.edges.at(-1)).toEqual({ id: 3, source: 2, target: 5, kind: 'access', attributes: {} });
    expect(p.assigned).toEqual({ nodes: { g3: 5 }, edges: {} });
  });

  it('operations are ordered: an edge to a node added later is rejected', async () => {
    const project = await transforming([
      { op: 'add-edge', source: 2, target: 'g3', kind: 'access' },
      { op: 'add-node', ref: 'g3', grid: [2, 0, 0], typeId: 'gallery' },
    ]);
    expect(expectDiagnostic(runUnchanged(labDoc(), project), 'missing-node').subject).toEqual({ kind: 'operation', index: 0 });
  });

  it('a failure in a later operation discards the earlier ones and keeps the original document', async () => {
    const project = await transforming([
      { op: 'add-node', ref: 'g3', grid: [2, 0, 0], typeId: 'gallery' },
      { op: 'add-edge', source: 1, target: 'g3', kind: 'stair' as never }, // not a relationship kind
    ]);
    const d = expectDiagnostic(runUnchanged(labDoc(), project), 'unknown-edge-kind');
    expect(d.subject).toEqual({ kind: 'operation', index: 1 });
  });

  it('applyTransformation never mutates its input, on success or failure', async () => {
    const project = await labToolkit();
    const doc = labDoc();
    const before = serializeDesignV2(doc);
    expectExtOk(applyTransformationV2(doc, project, [{ op: 'add-node', grid: [2, 0, 0], typeId: 'gallery' }]));
    expect(applyTransformationV2(doc, project, [{ op: 'add-node', grid: [1, 0, 0], typeId: 'gallery' }]).ok).toBe(false);
    expect(serializeDesignV2(doc)).toBe(before);
  });

  it('the final document validation is authoritative (e.g. the node limit)', async () => {
    const project = await labToolkit();
    const full = expectOk(
      validateDocumentV2({
        schemaVersion: 2,
        metadata: { name: 'Full' },
        nodes: Array.from({ length: DEFAULT_LIMITS.maxNodes }, (_, i) => ({
          id: i + 1,
          grid: [i % 50, Math.floor(i / 50), 0],
          typeId: 'studio',
          attributes: {},
        })),
        edges: [],
      }),
    );
    const result = applyTransformationV2(full, project, [{ op: 'add-node', grid: [0, 0, 1], typeId: 'studio' }]);
    expect(expectDiagnostic(result, 'final-document-invalid').message).toContain('too-many-nodes');
    expect(full.nodes).toHaveLength(DEFAULT_LIMITS.maxNodes);
  });

  it.each<[string, SpatialOperation, Parameters<typeof expectDiagnostic>[1]]>([
    ['a new edge kind', { op: 'add-edge', source: 2, target: 3, kind: 'stair' as never }, 'unknown-edge-kind'],
    ['an empty ref', { op: 'add-edge', ref: '', source: 2, target: 3, kind: 'access' }, 'invalid-id'],
    ['a self edge', { op: 'add-edge', source: 1, target: 1, kind: 'access' }, 'self-edge'],
    ['a duplicate relationship', { op: 'add-edge', source: 2, target: 1, kind: 'open' }, 'duplicate-relationship'],
    ['a missing endpoint', { op: 'add-edge', source: 1, target: 99, kind: 'access' }, 'missing-node'],
    ['an unknown ref', { op: 'add-edge', source: 1, target: 'ghost', kind: 'access' }, 'missing-node'],
  ])('add-edge rejects %s', async (_name, op, code) => {
    expectDiagnostic(runUnchanged(labDoc(), await transforming([op])), code);
  });
});

describe('set-node-attribute and conformance non-regression', () => {
  it('replacing an invalid stored value with a valid one resolves its diagnostic and keeps legacy attributes', async () => {
    const project = await transforming([{ op: 'set-node-attribute', nodeId: 2, key: 'daylight', value: 'medium' }]);
    const p = preview(expectExtOk(runUnchanged(labDoc(), project)));
    expect(p.after.nodes.find((n) => n.id === 2)!.attributes).toEqual({ daylight: 'medium', legacy: 'kept' });
    expect(p.resolvedDiagnosticIds).toEqual(['invalid-attribute-value|node:2|daylight']);
  });

  it('writing a missing declared attribute or null is allowed', async () => {
    const project = await transforming([
      { op: 'set-node-attribute', nodeId: 3, key: 'public', value: true },
      { op: 'set-node-attribute', nodeId: 1, key: 'daylight', value: null },
    ]);
    const p = preview(expectExtOk(runAlgorithmV2(labDoc(), project, 't')));
    expect(p.after.nodes.find((n) => n.id === 3)!.attributes).toEqual({ occupancy: 4, public: true });
    expect(p.after.nodes.find((n) => n.id === 1)!.attributes).toEqual({ daylight: null, public: true });
  });

  it.each<[string, SpatialOperation, Parameters<typeof expectDiagnostic>[1]]>([
    ['an undeclared (legacy) attribute', { op: 'set-node-attribute', nodeId: 2, key: 'legacy', value: 'x' }, 'undeclared-attribute-write'],
    ['an invalid value', { op: 'set-node-attribute', nodeId: 1, key: 'daylight', value: 'bright' }, 'invalid-attribute-value'],
    ['a missing node', { op: 'set-node-attribute', nodeId: 99, key: 'daylight', value: 'low' }, 'missing-node'],
    ['an unknown ref', { op: 'set-node-attribute', nodeId: 'ghost', key: 'daylight', value: 'low' }, 'missing-node'],
  ])('rejects writing %s', async (_name, op, code) => {
    expectDiagnostic(runUnchanged(labDoc(), await transforming([op])), code);
  });

  it('pre-existing problems are tolerated: unrelated transformations still succeed', async () => {
    const project = await transforming([{ op: 'add-node', grid: [2, 0, 0], typeId: 'gallery' }]);
    const p = preview(expectExtOk(runAlgorithmV2(labDoc(), project, 't')));
    expect(p.resolvedDiagnosticIds).toEqual([]);
    expect(p.after.nodes.find((n) => n.id === 2)!.attributes).toEqual({ daylight: 'bright', legacy: 'kept' });
  });
});

describe('result and parameter validation', () => {
  it.each<[string, () => unknown, Parameters<typeof expectDiagnostic>[1]]>([
    ['throws', () => { throw new Error('boom'); }, 'run-failed'],
    ['returns undefined', () => undefined, 'invalid-result'],
    ['returns an analysis', () => ({ kind: 'analysis', nodeValues: {} }), 'invalid-result'],
    ['returns an unknown op', () => ({ kind: 'transformation', operations: [{ op: 'remove-node', nodeId: 1 }] }), 'invalid-result'],
    ['returns extra fields', () => ({ kind: 'transformation', operations: [], extra: 1 }), 'invalid-result'],
    ['returns a non-primitive value', () => ({ kind: 'transformation', operations: [{ op: 'set-node-attribute', nodeId: 1, key: 'daylight', value: { a: 1 } }] }), 'invalid-result'],
  ])('a spatial algorithm that %s is rejected', async (_name, run, code) => {
    const project = await labToolkit({ [ALG]: { default: { id: 't', label: 'T', scope: 'spatial', run } } });
    expectDiagnostic(runUnchanged(labDoc(), project), code);
  });

  it('changes the algorithm makes to its own result afterwards have no effect', async () => {
    const ops: SpatialOperation[] = [{ op: 'add-node', ref: 'g3', grid: [2, 0, 0], typeId: 'gallery' }];
    const project = await transforming(() => ops);
    const p = preview(expectExtOk(runAlgorithmV2(labDoc(), project, 't')));
    ops.push({ op: 'add-node', ref: 'g4', grid: [3, 0, 0], typeId: 'gallery' });
    (ops[0] as { ref: string }).ref = 'changed';
    expect(p.operations).toEqual([{ op: 'add-node', ref: 'g3', grid: [2, 0, 0], typeId: 'gallery' }]);
    expect(p.after.nodes.at(-1)!.id).toBe(5);
    expect(p.assigned.nodes).toEqual({ g3: 5 });
  });

  it('validates parameters and applies defaults', async () => {
    let params: unknown;
    const project = await labToolkit({
      [ALG]: {
        default: defineSpatialAlgorithm({
          id: 't',
          label: 'T',
          parameters: { count: { kind: 'number', min: 1, default: 2 }, mode: { kind: 'enum', values: ['a', 'b'] } },
          run: (ctx) => ((params = ctx.params), { kind: 'transformation', operations: [] }),
        }),
      },
    });
    expectExtOk(runAlgorithmV2(labDoc(), project, 't'));
    expect(params).toEqual({ count: 2 });
    expectExtOk(runAlgorithmV2(labDoc(), project, 't', { count: 5, mode: 'b' }));
    expect(params).toEqual({ count: 5, mode: 'b' });
    expectDiagnostic(runAlgorithmV2(labDoc(), project, 't', { count: 0 }), 'invalid-parameter');
    expectDiagnostic(runAlgorithmV2(labDoc(), project, 't', { other: 1 }), 'invalid-parameter');
    expectDiagnostic(runAlgorithmV2(labDoc(), project, 't', 'x'), 'invalid-parameter');
  });

  it('reports unknown and disabled algorithms', async () => {
    const project = await labToolkit({ [ALG]: { default: { id: 't', label: 'T', run: () => null } } });
    expectDiagnostic(runAlgorithmV2(labDoc(), project, 'nope'), 'unknown-algorithm');
    expectDiagnostic(runAlgorithmV2(labDoc(), project, 't'), 'algorithm-disabled');
  });
});

describe('future student exercise (written only against @student-api)', () => {
  /** "Find a free adjacent cell, add a new gallery node and connect it by a door to an existing gallery." */
  const extendGallery = defineSpatialAlgorithm({
    id: 't',
    label: 'Extend a gallery',
    run(ctx) {
      const galleries = ctx.design.nodes.filter((n) => n.typeId === galleryType.id).sort((a, b) => a.id - b.id);
      for (const existing of galleries) {
        for (const direction of FACE_DIRECTIONS.filter((d) => d !== '+z' && d !== '-z')) {
          const cell = neighbourCell(existing.grid, direction);
          if (ctx.nodeAt(cell) !== undefined) continue;
          return {
            kind: 'transformation',
            operations: [
              { op: 'add-node', ref: 'new-gallery', grid: cell, typeId: galleryType.id, attributes: { daylight: 'medium' } },
              { op: 'add-edge', source: existing.id, target: 'new-gallery', kind: 'access' },
            ],
          };
        }
      }
      return { kind: 'transformation', summary: 'No free cell next to a gallery.', operations: [] };
    },
  });

  it('is supported atomically by the current API', async () => {
    const project = await labToolkit({ [ALG]: { default: extendGallery } });
    const p = preview(expectExtOk(runUnchanged(labDoc(), project)));
    expect(p.after.nodes.at(-1)).toEqual({ id: 5, grid: [-1, 0, 0], size: [1, 1, 1], typeId: 'gallery', attributes: { daylight: 'medium' } });
    expect(p.after.edges.at(-1)).toEqual({ id: 3, source: 1, target: 5, kind: 'access', attributes: {} });
  });
});

describe('graph analysis inputs and results (P4)', () => {
  const echo = (inputs: Parameters<typeof defineGraphAlgorithm>[0]['inputs'], result: (ctx: GraphAlgorithmContext) => unknown) =>
    labToolkit({ [ALG]: { default: defineGraphAlgorithm({ id: 't', label: 'T', inputs, run: (ctx) => result(ctx) as AnalysisResult }) } });

  it('passes the picked inputs in order; a missing number takes its default', async () => {
    let seen: readonly number[] = [];
    const project = await echo(
      [
        { kind: 'node', label: 'From' },
        { kind: 'edge', label: 'Via' },
        { kind: 'number', label: 'Steps', min: 1, default: 2 },
      ],
      (ctx) => ((seen = ctx.inputs), { kind: 'analysis', value: 1 }),
    );
    expectExtOk(runAlgorithmV2(labDoc(), project, 't', undefined, { inputs: [3, 2] }));
    expect(seen).toEqual([3, 2, 2]);
  });

  it.each<[string, unknown[], string]>([
    ['an unknown node', [99, 1, 2], 'From: there is no node 99'],
    ['an unknown edge', [1, 99, 2], 'Via: there is no edge 99'],
    ['a number below min', [1, 1, 0], 'Steps: must be at least 1'],
    ['a missing node', [], 'From: pick a node'],
    ['text for a number', [1, 1, 'x'], 'Steps: type a number'],
    ['too many inputs', [1, 1, 2, 4], '4 inputs were given'],
  ])('refuses %s with a readable reason and does not run', async (_name, inputs, message) => {
    let runs = 0;
    const project = await echo(
      [
        { kind: 'node', label: 'From' },
        { kind: 'edge', label: 'Via' },
        { kind: 'number', label: 'Steps', min: 1 },
      ],
      () => (runs++, { kind: 'analysis', value: 1 }),
    );
    expect(expectDiagnostic(runAlgorithmV2(labDoc(), project, 't', undefined, { inputs }), 'invalid-input').message).toContain(message);
    expect(runs).toBe(0);
  });

  it('accepts value, text and highlights; refuses unknown ids, wrong types and empty results', async () => {
    const ok = await echo([], () => ({ kind: 'analysis', value: 2, text: 'two', highlightNodes: [1, 1, 2], highlightEdges: [2] }));
    expect(expectExtOk(runAlgorithmV2(labDoc(), ok, 't'))).toEqual({
      kind: 'analysis',
      result: { kind: 'analysis', value: 2, text: 'two', highlightNodes: [1, 2], highlightEdges: [2] },
    });
    const node = await echo([], () => ({ kind: 'analysis', highlightNodes: [42] }));
    expect(expectDiagnostic(runAlgorithmV2(labDoc(), node, 't'), 'unknown-node-reference').message).toContain('highlightNodes refers to node 42');
    const edge = await echo([], () => ({ kind: 'analysis', highlightEdges: [42] }));
    expect(expectDiagnostic(runAlgorithmV2(labDoc(), edge, 't'), 'unknown-edge-reference').message).toContain('highlightEdges refers to edge 42');
    const wrong = await echo([], () => ({ kind: 'analysis', value: 'three' }));
    expect(expectDiagnostic(runAlgorithmV2(labDoc(), wrong, 't'), 'invalid-result').message).toContain('value must be a number');
    const empty = await echo([], () => ({ kind: 'analysis' }));
    expect(expectDiagnostic(runAlgorithmV2(labDoc(), empty, 't'), 'invalid-result').message).toContain('at least one of');
  });

  it('requires inputs on graph analyses and refuses parameters', async () => {
    const missing = await labToolkit({ [ALG]: { default: { id: 't', label: 'T', scope: 'graph', run: () => ({ kind: 'analysis', value: 1 }) } } });
    expect(missing.algorithms[0]!.status.ok).toBe(false);
    expect(missing.diagnostics.map((d) => d.message).join()).toContain('inputs must be a list');
    const params = await labToolkit({
      [ALG]: { default: { id: 't', label: 'T', scope: 'graph', inputs: [], parameters: { k: { kind: 'number' } }, run: () => ({ kind: 'analysis', value: 1 }) } },
    });
    expect(params.diagnostics.map((d) => d.message).join()).toContain('graph analyses take no parameters');
    const badInput = await labToolkit({
      [ALG]: { default: { id: 't', label: 'T', scope: 'graph', inputs: [{ kind: 'room', label: 'R' }], run: () => ({ kind: 'analysis', value: 1 }) } },
    });
    expect(badInput.diagnostics.map((d) => d.message).join()).toContain('an input kind must be "node", "edge" or "number"');
  });
});

describe('docs/STUDENT-API.md analysis examples', () => {
  const countNeighbours = defineGraphAlgorithm({
    id: 'count-neighbours',
    label: 'Count neighbours',
    inputs: [{ kind: 'node', label: 'Node' }],
    run({ graph, inputs }) {
      const node = inputs[0]!; // one value per input, in order: never missing
      const around = neighbours(graph, node);
      return { kind: 'analysis', value: around.length, highlightNodes: around };
    },
  });
  const directlyConnected = defineGraphAlgorithm({
    id: 'directly-connected',
    label: 'Directly connected?',
    inputs: [
      { kind: 'node', label: 'From' },
      { kind: 'node', label: 'To' },
    ],
    run({ graph, inputs }) {
      const from = inputs[0]!;
      const to = inputs[1]!;
      const edges = edgesBetween(graph, from, to);
      return {
        kind: 'analysis',
        text: edges.length > 0 ? 'Yes, they share an edge' : 'No direct edge',
        highlightNodes: [from, to],
        highlightEdges: edges.map((e) => e.id),
      };
    },
  });

  it('run as documented on the lab design', async () => {
    const project = await labToolkit({ 'toolkits/lab/algorithms/a.ts': { default: countNeighbours }, 'toolkits/lab/algorithms/b.ts': { default: directlyConnected } });
    expect(expectExtOk(runAlgorithmV2(labDoc(), project, 'count-neighbours', undefined, { inputs: [1] }))).toEqual({
      kind: 'analysis',
      result: { kind: 'analysis', value: 2, highlightNodes: [2, 3] },
    });
    expect(expectExtOk(runAlgorithmV2(labDoc(), project, 'directly-connected', undefined, { inputs: [1, 2] }))).toEqual({
      kind: 'analysis',
      result: { kind: 'analysis', text: 'Yes, they share an edge', highlightNodes: [1, 2], highlightEdges: [1] },
    });
  });
});
