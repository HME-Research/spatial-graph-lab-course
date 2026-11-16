import { describe, expect, it } from 'vitest';
import { readDesign, readDesignJson, serializeDesignV2, type DesignDocumentV2 } from '@app/document/v2';
import { applyDesignCommand } from '@app/spatial';
import { defineNodeType, defineProject, defineSpatialAlgorithm, type SpatialOperation } from '@student-api';
import { applySchemaEdit, type SchemaEdit } from './attributeEdits';
import { checkConformance } from './conformance';
import { runAlgorithmV2 } from './run';
import type { ProjectAttributeSchema } from './projectAttributes';
import { effectiveEdgeValues, effectiveNodeValues, viewAttributes } from './resolveAttributes';
import { expectExtOk, labProject } from './test-fixtures';

/** Phase 02: one effective-attribute engine for Student API, transformations and conformance. */

const v2 = (raw: unknown): DesignDocumentV2 => {
  const r = readDesign(raw);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value.doc;
};
const docA = () =>
  v2({
    schemaVersion: 2,
    metadata: { name: 'A' },
    nodes: [
      { id: 'g', grid: [0, 0, 0], typeId: 'gallery', attributes: {} },
      { id: 's', grid: [1, 0, 0], typeId: 'studio', attributes: { capacity: 3 } },
      { id: 'k', grid: [2, 0, 0], typeId: 'kiosk', attributes: {} },
    ],
    edges: [
      { id: 'gs', source: 'g', target: 's', kind: 'access', attributes: {} },
      { id: 'sk', source: 's', target: 'k', kind: 'open', attributes: { weight: 5 } },
    ],
  });
const docB = () =>
  v2({ schemaVersion: 2, metadata: { name: 'B' }, nodes: [{ id: 'g2', grid: [0, 0, 0], typeId: 'gallery', attributes: { capacity: 40 } }], edges: [] });

function schemaWith(base: ProjectAttributeSchema, ...edits: SchemaEdit[]): ProjectAttributeSchema {
  return edits.reduce((s, e) => {
    const r = applySchemaEdit(s, e);
    if (!r.ok) throw new Error(r.reason);
    return r.schema;
  }, base);
}

/** Spatial algorithm that reports what it reads, as one set-node-attribute per node (value = JSON). */
const reader = defineSpatialAlgorithm({
  id: 'reader',
  label: 'Reader',
  run(ctx) {
    const operations: SpatialOperation[] = ctx.design.nodes.map((n) => ({ op: 'set-node-attribute', nodeId: n.id, key: 'note', value: JSON.stringify(ctx.nodeAttributes(n.id)) }));
    return { kind: 'transformation', summary: JSON.stringify({ fields: ctx.attributeFields, edges: ctx.design.edges.map((e) => ctx.edgeAttributes(e.id)) }), operations };
  },
});
const writer = (operations: SpatialOperation[]) => defineSpatialAlgorithm({ id: 'writer', label: 'Writer', run: () => ({ kind: 'transformation', operations }) });

async function project(extra: Record<string, unknown> = {}) {
  return labProject({
    'projects/lab/project.ts': {
      default: defineProject({
        name: 'Lab',
        attributes: { nodes: { capacity: { kind: 'number', min: 0, default: 10 }, note: { kind: 'text' } }, edges: { weight: { kind: 'number', default: 1 } } },
      }),
    },
    'projects/lab/algorithms/reader.ts': { default: reader },
    ...extra,
  });
}

describe('Student API reads effective values (same resolver as the app)', () => {
  it('works on two designs of one project, including unknown types and Access/Open edges', async () => {
    const p = await project();
    const schema = schemaWith(p.attributeBaseline.schema, { type: 'set-type-default', typeId: 'gallery', fieldId: 'capacity', value: 25 });
    for (const [doc, expected] of [
      [docA(), { g: { capacity: 25, public: true }, s: { capacity: 3, public: false }, k: { capacity: 10 } }],
      [docB(), { g2: { capacity: 40, public: true } }],
    ] as const) {
      const preview = expectExtOk(runAlgorithmV2(doc, p, 'reader', {}, { attributes: schema }));
      if (preview.kind !== 'transformation') throw new Error('expected a transformation');
      const read = Object.fromEntries(preview.preview.after.nodes.map((n) => [n.id, JSON.parse(String(n.attributes['note']))]));
      expect(read).toEqual(expected);
      // The algorithm saw exactly what the app's resolver gives.
      for (const n of doc.nodes) expect(read[n.id]).toEqual(effectiveNodeValues(schema, n));
      const summary = JSON.parse(preview.preview.summary!);
      expect(summary.fields.nodes.map((f: { key: string }) => f.key)).toEqual(['capacity', 'note', 'daylight', 'public', 'occupancy']);
      expect(summary.fields.edges.map((f: { key: string }) => f.key)).toEqual(['weight']);
      expect(summary.edges).toEqual(doc.edges.map((e) => effectiveEdgeValues(schema, e)));
    }
  });

  it('attributesOf follows the project schema (type default changed in the app) for declared keys', async () => {
    const reads = defineSpatialAlgorithm({
      id: 'reads',
      label: 'Reads',
      run: (ctx) => ({ kind: 'transformation', summary: JSON.stringify(ctx.design.nodes.filter((n) => n.typeId === 'gallery').map((n) => ctx.attributesOf(n, gallery))), operations: [] }),
    });
    const gallery = defineNodeType({ id: 'gallery', label: 'Gallery', attributes: { public: { kind: 'boolean', default: true } } });
    const p = await project({ 'projects/lab/types/gallery.ts': { default: gallery }, 'projects/lab/algorithms/reads.ts': { default: reads } });
    const publicId = p.attributeBaseline.schema.nodes.find((f) => f.key === 'public')!.id;
    const schema = schemaWith(p.attributeBaseline.schema, { type: 'set-type-default', typeId: 'gallery', fieldId: publicId, value: false });
    const out = expectExtOk(runAlgorithmV2(docA(), p, 'reads', {}, { attributes: schema }));
    expect(out.kind === 'transformation' && JSON.parse(out.preview.summary!)).toEqual([{ public: false }]);
  });

  it('unknown node/edge ids fail the run with a diagnostic', async () => {
    const bad = defineSpatialAlgorithm({ id: 'bad', label: 'Bad', run: (ctx) => (ctx.nodeAttributes('nope'), { kind: 'transformation', operations: [] }) });
    const p = await project({ 'projects/lab/algorithms/bad.ts': { default: bad } });
    const r = runAlgorithmV2(docA(), p, 'bad');
    expect(r.ok ? 'ok' : r.issues[0]!.code).toBe('unknown-node-reference');
  });
});

describe('transformations write project fields', () => {
  const run = async (operations: SpatialOperation[], schema?: ProjectAttributeSchema) => {
    const p = await project({ 'projects/lab/algorithms/writer.ts': { default: writer(operations) } });
    return runAlgorithmV2(docA(), p, 'writer', {}, schema ? { attributes: schema } : {});
  };

  it('any node may get any node field, whatever its type (unknown type included); edges get edge fields', async () => {
    const r = await run([
      { op: 'set-node-attribute', nodeId: 'k', key: 'capacity', value: 7 },
      { op: 'set-edge-attribute', edgeId: 'gs', key: 'weight', value: 2 },
      { op: 'set-edge-attribute', edgeId: 'sk', key: 'weight', value: null },
    ]);
    const preview = expectExtOk(r);
    if (preview.kind !== 'transformation') throw new Error('expected a transformation');
    expect(preview.preview.after.nodes.find((n) => n.id === 'k')!.attributes).toEqual({ capacity: 7 });
    expect(preview.preview.after.edges.map((e) => e.attributes)).toEqual([{ weight: 2 }, { weight: null }]);
  });

  it('refuses keys that are not fields, values that do not fit, and missing edges', async () => {
    const code = async (op: SpatialOperation) => {
      const r = await run([op]);
      return r.ok ? 'ok' : r.issues[0]!.code;
    };
    expect(await code({ op: 'set-node-attribute', nodeId: 'g', key: 'weight', value: 1 })).toBe('undeclared-attribute-write');
    expect(await code({ op: 'set-edge-attribute', edgeId: 'gs', key: 'capacity', value: 1 })).toBe('undeclared-attribute-write');
    expect(await code({ op: 'set-node-attribute', nodeId: 'g', key: 'capacity', value: -1 })).toBe('invalid-attribute-value');
    expect(await code({ op: 'set-edge-attribute', edgeId: 'nope', key: 'weight', value: 1 })).toBe('missing-edge');
  });

  it('after a rename, writes through the old key land on the new key; a deleted field is refused', async () => {
    const p = await project();
    const renamed = schemaWith(p.attributeBaseline.schema, { type: 'rename-field', collection: 'nodes', fieldId: 'capacity', key: 'seats' });
    const r = expectExtOk(await run([{ op: 'set-node-attribute', nodeId: 's', key: 'capacity', value: 9 }], renamed));
    expect(r.kind === 'transformation' && r.preview.after.nodes.find((n) => n.id === 's')!.attributes).toEqual({ seats: 9 });
    const deleted = schemaWith(p.attributeBaseline.schema, { type: 'delete-field', collection: 'nodes', fieldId: 'capacity' });
    const refused = await run([{ op: 'set-node-attribute', nodeId: 's', key: 'capacity', value: 9 }], deleted);
    expect(refused.ok ? 'ok' : refused.issues[0]!.message).toMatch(/not a node field/);
  });
});

describe('type defaults, overrides and undo', () => {
  it('changing a type default changes non-overridden instances only; undo (previous schema) restores', async () => {
    const p = await project();
    const before = p.attributeBaseline.schema;
    const after = schemaWith(before, { type: 'set-type-default', typeId: 'studio', fieldId: 'capacity', value: 50 });
    const studioA = docA().nodes.find((n) => n.id === 's')!; // overridden: capacity 3
    const fresh = { id: 'n', typeId: 'studio', attributes: {} };
    expect(effectiveNodeValues(after, fresh)['capacity']).toBe(50);
    expect(effectiveNodeValues(after, studioA)['capacity']).toBe(3);
    expect(effectiveNodeValues(before, fresh)['capacity']).toBe(10);
  });

  it('Access ↔ Open keeps edge values and the same field list; delete node removes its edges only', async () => {
    const p = await project();
    const schema = p.attributeBaseline.schema;
    const doc = docA();
    const changed = applyDesignCommand(doc, { type: 'change-edge-kind', edgeId: 'sk', kind: 'access' });
    if (!changed.ok) throw new Error('kind change failed');
    expect(effectiveEdgeValues(schema, changed.value.edges[1]!)).toEqual({ weight: 5 });
    const withValue = applyDesignCommand(doc, { type: 'set-edge-attributes', edgeId: 'gs', attributes: { weight: 4 } });
    expect(withValue.ok && withValue.value.edges[0]!.attributes).toEqual({ weight: 4 });
    const missing = applyDesignCommand(doc, { type: 'set-edge-attributes', edgeId: 'nope', attributes: {} });
    expect(missing.ok).toBe(false);
    const removed = applyDesignCommand(doc, { type: 'remove-node', nodeId: 'k' });
    expect(removed.ok && removed.value.edges.map((e) => e.id)).toEqual(['gs']);
  });

  it('values survive v2 export → import unchanged; views see effective values plus legacy keys', async () => {
    const p = await project();
    const doc = v2({ ...JSON.parse(serializeDesignV2(docA())), nodes: [...docA().nodes.map((n) => (n.id === 'k' ? { ...n, attributes: { legacy: 'x' } } : n))] });
    const again = readDesignJson(serializeDesignV2(doc));
    expect(again.ok && again.value.doc).toEqual(doc);
    expect(viewAttributes(p.attributeBaseline.schema, 'nodes', doc.nodes[2]!)).toEqual({ capacity: 10, legacy: 'x' });
    expect(checkConformance(doc, p).filter((d) => d.severity !== 'info').map((d) => d.code)).toEqual(['unknown-node-type']);
  });
});
