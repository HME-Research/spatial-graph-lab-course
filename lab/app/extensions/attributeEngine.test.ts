import { describe, expect, it } from 'vitest';
import { readDesign, readDesignJson, serializeDesignV2, type DesignDocumentV2 } from '@app/document';
import { applyDesignCommand } from '@app/spatial';
import { defineFunction, defineToolkit, defineSpatialAlgorithm, type SpatialOperation } from '@student-api';
import { applySchemaEdit, type SchemaEdit } from './attributeEdits';
import { checkConformance } from './conformance';
import { runAlgorithmV2 } from './run';
import type { ProjectAttributeSchema } from './projectAttributes';
import { effectiveEdgeValues, effectiveNodeValues, viewAttributes } from './resolveAttributes';
import { expectExtOk, labToolkit } from './test-fixtures';

/** Phase 02: one effective-attribute engine for Student API, transformations and conformance. */

const v2 = (raw: unknown): DesignDocumentV2 => {
  const r = readDesign(raw);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value.doc;
};
/** g 1 gallery, s 2 studio, k 3 kiosk; edges gs 1 (access), sk 2 (open). */
const docA = () =>
  v2({
    schemaVersion: 2,
    metadata: { name: 'A' },
    nodes: [
      { id: 1, position: [0, 0, 0], function: 'gallery', custom: {} },
      { id: 2, position: [1, 0, 0], function: 'studio', custom: { capacity: 3 } },
      { id: 3, position: [2, 0, 0], function: 'kiosk', custom: {} },
    ],
    edges: [
      { id: 1, source: 1, target: 2, relationship: 'access', custom: {} },
      { id: 2, source: 2, target: 3, relationship: 'open', custom: { weight: 5 } },
    ],
  });
const docB = () =>
  v2({ schemaVersion: 2, metadata: { name: 'B' }, nodes: [{ id: 1, position: [0, 0, 0], function: 'gallery', custom: { capacity: 40 } }], edges: [] });

function schemaWith(base: ProjectAttributeSchema, ...edits: SchemaEdit[]): ProjectAttributeSchema {
  return edits.reduce((s, e) => {
    const r = applySchemaEdit(s, e);
    if (!r.ok) throw new Error(r.reason);
    return r.schema;
  }, base);
}

/** Spatial algorithm that reports what it reads, as one set-node-custom-attribute per node (value = JSON). */
const reader = defineSpatialAlgorithm({
  id: 'reader',
  label: 'Reader',
  run(ctx) {
    const operations: SpatialOperation[] = ctx.design.nodes.map((n) => ({ op: 'set-node-custom-attribute', nodeId: n.id, key: 'note', value: JSON.stringify(ctx.nodeCustom(n.id)) }));
    return { kind: 'transformation', summary: JSON.stringify({ fields: ctx.customFields, edges: ctx.design.edges.map((e) => ctx.edgeCustom(e.id)) }), operations };
  },
});
const writer = (operations: SpatialOperation[]) => defineSpatialAlgorithm({ id: 'writer', label: 'Writer', run: () => ({ kind: 'transformation', operations }) });

async function project(extra: Record<string, unknown> = {}) {
  return labToolkit({
    'toolkits/lab/toolkit.ts': {
      default: defineToolkit({
        name: 'Lab',
        custom: { nodes: { capacity: { kind: 'number', min: 0, default: 10 }, note: { kind: 'text' } }, edges: { weight: { kind: 'number', default: 1 } } },
      }),
    },
    'toolkits/lab/algorithms/reader.ts': { default: reader },
    ...extra,
  });
}

describe('Student API reads effective values (same resolver as the app)', () => {
  it('works on two designs of one project, including unknown types and Access/Open edges', async () => {
    const p = await project();
    const schema = schemaWith(p.attributeBaseline.schema, { type: 'set-type-default', function: 'gallery', fieldId: 'capacity', value: 25 });
    for (const [doc, expected] of [
      [docA(), { 1: { capacity: 25, public: true }, 2: { capacity: 3, public: false }, 3: { capacity: 10 } }],
      [docB(), { 1: { capacity: 40, public: true } }],
    ] as const) {
      const preview = expectExtOk(runAlgorithmV2(doc, p, 'reader', {}, { attributes: schema }));
      if (preview.kind !== 'transformation') throw new Error('expected a transformation');
      const read = Object.fromEntries(preview.preview.after.nodes.map((n) => [n.id, JSON.parse(String(n.custom['note']))]));
      expect(read).toEqual(expected);
      // The algorithm saw exactly what the app's resolver gives.
      for (const n of doc.nodes) expect(read[n.id]).toEqual(effectiveNodeValues(schema, n));
      const summary = JSON.parse(preview.preview.summary!);
      expect(summary.fields.nodes.map((f: { key: string }) => f.key)).toEqual(['capacity', 'note', 'daylight', 'public', 'occupancy']);
      expect(summary.fields.edges.map((f: { key: string }) => f.key)).toEqual(['weight']);
      expect(summary.edges).toEqual(doc.edges.map((e) => effectiveEdgeValues(schema, e)));
    }
  });

  it('customOf follows the project schema (type default changed in the app) for declared keys', async () => {
    const reads = defineSpatialAlgorithm({
      id: 'reads',
      label: 'Reads',
      run: (ctx) => ({ kind: 'transformation', summary: JSON.stringify(ctx.design.nodes.filter((n) => n.function === 'gallery').map((n) => ctx.customOf(n, gallery))), operations: [] }),
    });
    const gallery = defineFunction({ id: 'gallery', label: 'Gallery', custom: { public: { kind: 'boolean', default: true } } });
    const p = await project({ 'toolkits/lab/functions/gallery.ts': { default: gallery }, 'toolkits/lab/algorithms/reads.ts': { default: reads } });
    const publicId = p.attributeBaseline.schema.nodes.find((f) => f.key === 'public')!.id;
    const schema = schemaWith(p.attributeBaseline.schema, { type: 'set-type-default', function: 'gallery', fieldId: publicId, value: false });
    const out = expectExtOk(runAlgorithmV2(docA(), p, 'reads', {}, { attributes: schema }));
    expect(out.kind === 'transformation' && JSON.parse(out.preview.summary!)).toEqual([{ public: false }]);
  });

  it('unknown node/edge ids fail the run with a diagnostic', async () => {
    const bad = defineSpatialAlgorithm({ id: 'bad', label: 'Bad', run: (ctx) => (ctx.nodeCustom(99), { kind: 'transformation', operations: [] }) });
    const p = await project({ 'toolkits/lab/algorithms/bad.ts': { default: bad } });
    const r = runAlgorithmV2(docA(), p, 'bad');
    expect(r.ok ? 'ok' : r.issues[0]!.code).toBe('unknown-node-reference');
  });
});

describe('transformations write project fields', () => {
  const run = async (operations: SpatialOperation[], schema?: ProjectAttributeSchema) => {
    const p = await project({ 'toolkits/lab/algorithms/writer.ts': { default: writer(operations) } });
    return runAlgorithmV2(docA(), p, 'writer', {}, schema ? { attributes: schema } : {});
  };

  it('any node may get any node field, whatever its type (unknown type included); edges get edge fields', async () => {
    const r = await run([
      { op: 'set-node-custom-attribute', nodeId: 3, key: 'capacity', value: 7 },
      { op: 'set-edge-custom-attribute', edgeId: 1, key: 'weight', value: 2 },
      { op: 'set-edge-custom-attribute', edgeId: 2, key: 'weight', value: null },
    ]);
    const preview = expectExtOk(r);
    if (preview.kind !== 'transformation') throw new Error('expected a transformation');
    expect(preview.preview.after.nodes.find((n) => n.id === 3)!.custom).toEqual({ capacity: 7 });
    expect(preview.preview.after.edges.map((e) => e.custom)).toEqual([{ weight: 2 }, { weight: null }]);
  });

  it('refuses keys that are not fields, values that do not fit, and missing edges', async () => {
    const code = async (op: SpatialOperation) => {
      const r = await run([op]);
      return r.ok ? 'ok' : r.issues[0]!.code;
    };
    expect(await code({ op: 'set-node-custom-attribute', nodeId: 1, key: 'weight', value: 1 })).toBe('undeclared-attribute-write');
    expect(await code({ op: 'set-edge-custom-attribute', edgeId: 1, key: 'capacity', value: 1 })).toBe('undeclared-attribute-write');
    expect(await code({ op: 'set-node-custom-attribute', nodeId: 1, key: 'capacity', value: -1 })).toBe('invalid-attribute-value');
    expect(await code({ op: 'set-edge-custom-attribute', edgeId: 99, key: 'weight', value: 1 })).toBe('missing-edge');
  });

  it('after a rename, writes through the old key land on the new key; a deleted field is refused', async () => {
    const p = await project();
    const renamed = schemaWith(p.attributeBaseline.schema, { type: 'rename-field', collection: 'nodes', fieldId: 'capacity', key: 'seats' });
    const r = expectExtOk(await run([{ op: 'set-node-custom-attribute', nodeId: 2, key: 'capacity', value: 9 }], renamed));
    expect(r.kind === 'transformation' && r.preview.after.nodes.find((n) => n.id === 2)!.custom).toEqual({ seats: 9 });
    const deleted = schemaWith(p.attributeBaseline.schema, { type: 'delete-field', collection: 'nodes', fieldId: 'capacity' });
    const refused = await run([{ op: 'set-node-custom-attribute', nodeId: 2, key: 'capacity', value: 9 }], deleted);
    expect(refused.ok ? 'ok' : refused.issues[0]!.message).toMatch(/not a node field/);
  });
});

describe('type defaults, overrides and undo', () => {
  it('changing a type default changes non-overridden instances only; undo (previous schema) restores', async () => {
    const p = await project();
    const before = p.attributeBaseline.schema;
    const after = schemaWith(before, { type: 'set-type-default', function: 'studio', fieldId: 'capacity', value: 50 });
    const studioA = docA().nodes.find((n) => n.id === 2)!; // overridden: capacity 3
    const fresh = { id: 99, function: 'studio', custom: {} };
    expect(effectiveNodeValues(after, fresh)['capacity']).toBe(50);
    expect(effectiveNodeValues(after, studioA)['capacity']).toBe(3);
    expect(effectiveNodeValues(before, fresh)['capacity']).toBe(10);
  });

  it('Access ↔ Open keeps edge values and the same field list; delete node removes its edges only', async () => {
    const p = await project();
    const schema = p.attributeBaseline.schema;
    const doc = docA();
    const changed = applyDesignCommand(doc, { type: 'change-edge-kind', edgeId: 2, relationship: 'access' });
    if (!changed.ok) throw new Error('kind change failed');
    expect(effectiveEdgeValues(schema, changed.value.edges[1]!)).toEqual({ weight: 5 });
    const withValue = applyDesignCommand(doc, { type: 'set-edge-custom', edgeId: 1, custom: { weight: 4 } });
    expect(withValue.ok && withValue.value.edges[0]!.custom).toEqual({ weight: 4 });
    const missing = applyDesignCommand(doc, { type: 'set-edge-custom', edgeId: 99, custom: {} });
    expect(missing.ok).toBe(false);
    const removed = applyDesignCommand(doc, { type: 'remove-node', nodeId: 3 });
    expect(removed.ok && removed.value.edges.map((e) => e.id)).toEqual([1]);
  });

  it('values survive v2 export → import unchanged; views see effective values plus legacy keys', async () => {
    const p = await project();
    const doc = v2({ ...JSON.parse(serializeDesignV2(docA())), nodes: [...docA().nodes.map((n) => (n.id === 3 ? { ...n, custom: { legacy: 'x' } } : n))] });
    const again = readDesignJson(serializeDesignV2(doc));
    expect(again.ok && again.value.doc).toEqual(doc);
    expect(viewAttributes(p.attributeBaseline.schema, 'nodes', doc.nodes[2]!)).toEqual({ capacity: 10, legacy: 'x' });
    expect(checkConformance(doc, p).filter((d) => d.severity !== 'info').map((d) => d.code)).toEqual(['unknown-node-type']);
  });
});
