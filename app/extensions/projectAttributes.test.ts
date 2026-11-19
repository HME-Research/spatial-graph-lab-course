import { describe, expect, it } from 'vitest';
import { readDesign, readDesignJson, serializeDesignV2, type DesignDocumentV2 } from '@app/document';
import { defineGraphAlgorithm, defineFunction, defineToolkit, defineSpatialAlgorithm } from '@student-api';
import exampleV1 from '../document/test-designs/two-storey.json';
import { activate, type ActiveToolkit } from './activate';
import { deriveAttributeBaseline, humanizeKey, mergeBaseline } from './attributeBaseline';
import { algorithmReferences, applySchemaEdit, designSamples, fieldUsage, keyConflict, type EditOutcome, type SchemaEdit } from './attributeEdits';
import {
  EMPTY_ATTRIBUTE_SCHEMA,
  makeAttributeRecord,
  parseAttributeSchema,
  readAttributeRecord,
  schemaSignature,
  serializeAttributeRecord,
  type ProjectAttributeSchema,
} from './projectAttributes';
import {
  attributesOutsideSchema,
  effectiveEdgeValues,
  effectiveNodeValues,
  resolveEdgeAttributes,
  resolveNodeAttributes,
  writeFieldValue,
} from './resolveAttributes';
import { fakeGlobs, galleryType, LAB_FILES, labToolkit, studioType } from './test-fixtures';

/** Phase 01 contract: project-wide attribute schema, effective resolution, edits and records. */

const ok = (outcome: EditOutcome): ProjectAttributeSchema => {
  if (!outcome.ok) throw new Error(`expected ok, got: ${outcome.reason}`);
  return outcome.schema;
};
const refused = (outcome: EditOutcome): string => {
  if (outcome.ok) throw new Error('expected a refusal');
  return outcome.reason;
};
const edit = (schema: ProjectAttributeSchema, e: SchemaEdit, usage?: Parameters<typeof applySchemaEdit>[2]) => applySchemaEdit(schema, e, usage);

function v2(raw: unknown): DesignDocumentV2 {
  const r = readDesign(raw);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value.doc;
}

/** Two designs of one project: different rooms, sparse values. */
const designA = () =>
  v2({
    schemaVersion: 2,
    metadata: { name: 'A' },
    nodes: [
      { id: 1, position: [0, 0, 0], function: 'gallery', custom: { daylight: 'high' } },
      { id: 2, position: [1, 0, 0], function: 'storage', custom: {} },
    ],
    edges: [{ id: 1, source: 1, target: 2, relationship: 'access', custom: {} }],
  });
const designB = () =>
  v2({
    schemaVersion: 2,
    metadata: { name: 'B' },
    nodes: [
      { id: 1, position: [0, 0, 0], function: 'gallery', custom: { public: false } },
      { id: 2, position: [4, 0, 0], function: 'kiosk', custom: { capacity: 12 } },
    ],
    edges: [{ id: 1, source: 1, target: 2, relationship: 'open', custom: { weight: 2 } }],
  });

const storageType = defineFunction({ id: 'storage', label: 'Storage', custom: { public: { kind: 'boolean', default: false } } });

async function gallery(): Promise<ActiveToolkit> {
  return labToolkit({ 'toolkits/lab/functions/storage.ts': { default: storageType } });
}

describe('baseline from toolkit files', () => {
  it('unions node type declarations into one node field list; type defaults become type defaults', async () => {
    const project = await gallery();
    const { schema, diagnostics } = project.attributeBaseline;
    expect(diagnostics).toEqual([]);
    expect(schema.nodes.map((f) => [f.key, f.kind])).toEqual([
      ['daylight', 'enum'],
      ['public', 'boolean'],
      ['occupancy', 'number'],
    ]);
    expect(schema.nodes.find((f) => f.key === 'occupancy')?.min).toBe(0);
    expect(schema.nodes.every((f) => f.default === undefined)).toBe(true);
    expect(schema.functionDefaults).toEqual({ gallery: { public: true }, storage: { public: false }, studio: { public: false } });
    expect(schema.edges).toEqual([]);
  });

  it('reads defineToolkit({ custom }) with labels, help and separate edge fields', async () => {
    const project = await labToolkit({
      'toolkits/lab/toolkit.ts': {
        default: defineToolkit({
          name: 'Lab',
          custom: {
            nodes: { capacity: { kind: 'number', min: 0, default: 10, label: 'Capacity (people)' } },
            edges: { weight: { kind: 'number', default: 1, description: 'Cost of walking' } },
          },
        }),
      },
    });
    const { schema } = project.attributeBaseline;
    expect(schema.nodes[0]).toEqual({ id: 'capacity', key: 'capacity', label: 'Capacity (people)', kind: 'number', min: 0, default: 10 });
    expect(schema.edges).toEqual([{ id: 'weight', key: 'weight', label: 'Weight', kind: 'number', default: 1, description: 'Cost of walking' }]);
  });

  it('reports conflicting and unusable declarations; the first declaration wins', async () => {
    const odd = defineFunction({ id: 'odd', label: 'Odd', custom: { public: { kind: 'text' }, type: { kind: 'text' } } });
    const project = await labToolkit({ 'toolkits/lab/functions/zz-odd.ts': { default: odd } });
    const codes = project.attributeBaseline.diagnostics.map((d) => [d.code, d.attribute]);
    expect(codes).toContainEqual(['attribute-declaration-conflict', 'public']);
    expect(codes).toContainEqual(['attribute-declaration-conflict', 'type']);
    expect(project.attributeBaseline.schema.nodes.find((f) => f.key === 'public')?.kind).toBe('boolean');
    expect(project.diagnostics.some((d) => d.code === 'attribute-declaration-conflict')).toBe(true);
  });

  it('rejects an invalid project attribute declaration at activation (whole definition invalid)', async () => {
    const { activation } = await activate(
      fakeGlobs({ ...LAB_FILES, 'toolkits/lab/toolkit.ts': { default: { name: 'Lab', custom: { nodes: { x: { kind: 'colour' } } } } } }),
      { query: 'lab' },
    );
    expect(activation.status).toBe('failed');
  });

  it('flags a reserved key declared in defineToolkit and ignores it', async () => {
    const project = await labToolkit({
      'toolkits/lab/toolkit.ts': { default: defineToolkit({ name: 'Lab', custom: { nodes: { position: { kind: 'text' } } } }) },
    });
    expect(project.attributeBaseline.schema.nodes.some((f) => f.key === 'position')).toBe(false);
    expect(project.diagnostics.find((d) => d.code === 'invalid-attribute-schema')?.message).toMatch(/reserved/);
  });

  it('is deterministic (same files → same signature)', async () => {
    const a = await gallery();
    const b = await gallery();
    expect(a.attributeBaseline.signature).toBe(b.attributeBaseline.signature);
  });

  it('humanizes keys for labels', () => {
    expect(humanizeKey('floorArea')).toBe('Floor area');
    expect(humanizeKey('room_count')).toBe('Room count');
  });

  it('only valid node types contribute', () => {
    const baseline = deriveAttributeBaseline('lab', { name: 'Lab' }, [
      { id: 'gallery', file: 'g.ts', definition: galleryType, status: { ok: true } },
      { id: 'studio', file: 's.ts', definition: studioType, status: { ok: false, diagnosticIds: ['x'] } },
    ]);
    expect(baseline.schema.nodes.map((f) => f.key)).toEqual(['daylight', 'public']);
  });
});

describe('effective values (shared by every design of the project)', () => {
  it('two designs of one project see the same field list; values stay per instance', async () => {
    const { schema } = (await gallery()).attributeBaseline;
    const [a, b] = [designA(), designB()];
    const fieldsOf = (doc: DesignDocumentV2) => doc.nodes.map((n) => resolveNodeAttributes(schema, n).map((r) => r.field.key));
    for (const list of [...fieldsOf(a), ...fieldsOf(b)]) expect(list).toEqual(['daylight', 'public', 'occupancy']);
    expect(effectiveNodeValues(schema, a.nodes[0]!)).toEqual({ daylight: 'high', public: true });
    expect(effectiveNodeValues(schema, a.nodes[1]!)).toEqual({ public: false });
    expect(effectiveNodeValues(schema, b.nodes[0]!)).toEqual({ public: false });
    // Unknown type: no type defaults, same fields.
    expect(resolveNodeAttributes(schema, b.nodes[1]!).map((r) => r.source)).toEqual(['none', 'none', 'none']);
  });

  it('a newly added field appears for every node of every design without writing values', async () => {
    const { schema } = (await gallery()).attributeBaseline;
    const next = ok(edit(schema, { type: 'add-field', collection: 'nodes', field: { key: 'capacity', kind: 'number', default: 5 } }));
    const [a, b] = [designA(), designB()];
    for (const node of [...a.nodes, ...b.nodes.filter((n) => n.id !== 2)]) expect(effectiveNodeValues(next, node)['capacity']).toBe(5);
    // b.x already stored capacity 12 (legacy data): it becomes that field's instance value.
    expect(effectiveNodeValues(next, b.nodes[1]!)['capacity']).toBe(12);
    expect(designA()).toEqual(a); // designs are untouched
  });

  it('precedence: instance → type default → schema default; explicit null; invalid falls through', () => {
    let schema = ok(edit(EMPTY_ATTRIBUTE_SCHEMA, { type: 'add-field', collection: 'nodes', field: { key: 'public', kind: 'boolean', default: false } }));
    schema = ok(edit(schema, { type: 'set-type-default', function: 'gallery', fieldId: 'public', value: true }));
    const r = (functionId: string, attributes: Record<string, unknown>) => resolveNodeAttributes(schema, { function: functionId, custom: attributes })[0]!;
    expect([r('gallery', {}).value, r('gallery', {}).source]).toEqual([true, 'type-default']);
    expect([r('studio', {}).value, r('studio', {}).source]).toEqual([false, 'schema-default']);
    expect([r('gallery', { public: false }).value, r('gallery', { public: false }).source]).toEqual([false, 'instance']);
    expect([r('gallery', { public: null }).value, r('gallery', { public: null }).stored]).toEqual([null, 'null']);
    const invalid = r('gallery', { public: 'yes' });
    expect([invalid.value, invalid.source, invalid.stored, invalid.storedValue]).toEqual([true, 'type-default', 'invalid', 'yes']);
    expect(r('gallery', {}).inherited).toBe(true);
  });

  it('edge fields are one list for Access and Open edges; schema defaults only', () => {
    const schema = ok(edit(EMPTY_ATTRIBUTE_SCHEMA, { type: 'add-field', collection: 'edges', field: { key: 'weight', kind: 'number', default: 1 } }));
    const b = designB();
    const a = designA();
    expect(resolveEdgeAttributes(schema, a.edges[0]!).map((r) => r.field.key)).toEqual(['weight']);
    expect(effectiveEdgeValues(schema, a.edges[0]!)).toEqual({ weight: 1 }); // access
    expect(effectiveEdgeValues(schema, b.edges[0]!)).toEqual({ weight: 2 }); // open, stored
    // Node and edge collections are disjoint.
    expect(resolveNodeAttributes(schema, a.nodes[0]!)).toEqual([]);
  });

  it('separate projects do not share definitions', async () => {
    const lab = await gallery();
    const other = await labToolkit({
      'toolkits/lab/toolkit.ts': { default: defineToolkit({ name: 'Other', custom: { nodes: { quiet: { kind: 'boolean' } } } }) },
      'toolkits/lab/functions/gallery.ts': { default: defineFunction({ id: 'gallery', label: 'G' }) },
      'toolkits/lab/functions/studio.ts': { default: defineFunction({ id: 'studio', label: 'S' }) },
    });
    expect(other.attributeBaseline.schema.nodes.map((f) => f.key)).toEqual(['quiet']);
    expect(lab.attributeBaseline.schema.nodes.map((f) => f.key)).not.toContain('quiet');
  });

  it('values outside the schema are listed separately and kept', async () => {
    const { schema } = (await gallery()).attributeBaseline;
    expect(attributesOutsideSchema(schema, 'nodes', { daylight: 'low', legacy: 'kept' })).toEqual({ legacy: 'kept' });
  });
});

describe('schema edits', () => {
  const base = () => ok(edit(EMPTY_ATTRIBUTE_SCHEMA, { type: 'add-field', collection: 'nodes', field: { key: 'capacity', kind: 'number', min: 0 } }));

  it('rejects duplicate (any case), reserved and malformed keys', () => {
    const schema = base();
    expect(refused(edit(schema, { type: 'add-field', collection: 'nodes', field: { key: 'Capacity', kind: 'text' } }))).toMatch(/already uses/);
    for (const key of ['id', 'function', 'position', 'size', 'custom', 'source', 'relationship', 'corridor', '__proto__', 'constructor']) {
      expect(keyConflict(schema, 'nodes', key)).not.toBeNull();
    }
    expect(refused(edit(schema, { type: 'add-field', collection: 'nodes', field: { key: '2nd', kind: 'text' } }))).toMatch(/not a valid key/);
    expect(refused(edit(schema, { type: 'add-field', collection: 'nodes', field: { key: 'a b', kind: 'text' } }))).toMatch(/not a valid key/);
    // The same key is fine in the other collection.
    expect(edit(schema, { type: 'add-field', collection: 'edges', field: { key: 'capacity', kind: 'number' } }).ok).toBe(true);
  });

  it('rejects invalid defaults and empty choices', () => {
    expect(refused(edit(EMPTY_ATTRIBUTE_SCHEMA, { type: 'add-field', collection: 'nodes', field: { key: 'n', kind: 'number', min: 0, default: -1 } }))).toMatch(/default/);
    expect(refused(edit(EMPTY_ATTRIBUTE_SCHEMA, { type: 'add-field', collection: 'nodes', field: { key: 'c', kind: 'enum', values: [] } }))).toMatch(/at least one/);
    expect(refused(edit(base(), { type: 'set-type-default', function: 'gallery', fieldId: 'capacity', value: 'many' }))).toMatch(/must be a number/);
  });

  it('rename keeps the identity and the stored values (former keys); writing migrates the key', () => {
    const renamed = ok(edit(base(), { type: 'rename-field', collection: 'nodes', fieldId: 'capacity', key: 'seats' }));
    const field = renamed.nodes[0]!;
    expect([field.id, field.key, field.formerKeys]).toEqual(['capacity', 'seats', ['capacity']]);
    const stored = { capacity: 8, note: 'x' };
    expect(effectiveNodeValues(renamed, { function: 'gallery', custom: stored })).toEqual({ seats: 8 });
    expect(resolveNodeAttributes(renamed, { function: 'g', custom: stored })[0]!.storedKey).toBe('capacity');
    expect(writeFieldValue(field, stored, 9)).toEqual({ note: 'x', seats: 9 });
    expect(writeFieldValue(field, stored, undefined)).toEqual({ note: 'x' });
    // A former key cannot be taken by another field; renaming back is allowed.
    expect(refused(edit(renamed, { type: 'add-field', collection: 'nodes', field: { key: 'capacity', kind: 'text' } }))).toMatch(/former key/);
    const back = ok(edit(renamed, { type: 'rename-field', collection: 'nodes', fieldId: 'capacity', key: 'capacity' }));
    expect([back.nodes[0]!.key, back.nodes[0]!.formerKeys]).toEqual(['capacity', ['seats']]);
  });

  it('kind change is refused while known values or defaults would become invalid', () => {
    const schema = base();
    const usage = { usage: designSamples(null, { doc: { nodes: [{ id: 1, function: 'g', custom: { capacity: 8 } }], edges: [] }, source: 'a.json' }) };
    expect(refused(edit(schema, { type: 'change-field-kind', collection: 'nodes', fieldId: 'capacity', kind: 'boolean' }, usage))).toMatch(/1 stored value \(8\)/);
    expect(edit(schema, { type: 'change-field-kind', collection: 'nodes', fieldId: 'capacity', kind: 'text' }).ok).toBe(true);
    const withDefault = ok(edit(schema, { type: 'set-type-default', function: 'g', fieldId: 'capacity', value: 3 }));
    expect(refused(edit(withDefault, { type: 'change-field-kind', collection: 'nodes', fieldId: 'capacity', kind: 'text' }))).toMatch(/type “g”/);
    // Narrowing limits under a stored value is refused too.
    expect(refused(edit(schema, { type: 'update-field', collection: 'nodes', fieldId: 'capacity', patch: { max: 5 } }, usage))).toMatch(/stored value/);
  });

  it('delete removes the definition and its type defaults, never stored values', () => {
    const schema = ok(edit(base(), { type: 'set-type-default', function: 'g', fieldId: 'capacity', value: 3 }));
    const deleted = ok(edit(schema, { type: 'delete-field', collection: 'nodes', fieldId: 'capacity' }));
    expect(deleted.nodes).toEqual([]);
    expect(deleted.functionDefaults).toEqual({});
    expect(attributesOutsideSchema(deleted, 'nodes', { capacity: 8 })).toEqual({ capacity: 8 });
  });

  it('impact: counts instances per known design (open design replaces its own file)', async () => {
    const project = await labToolkit({
      'toolkits/lab/designs/one.json': serializeDesignV2(designA()),
      'toolkits/lab/designs/two.json': serializeDesignV2(designB()),
    });
    const daylight = project.attributeBaseline.schema.nodes.find((f) => f.key === 'daylight')!;
    const open = { doc: designB(), source: 'toolkits/lab/designs/one.json' };
    const usage = fieldUsage(daylight, 'nodes', designSamples(project, open));
    expect(usage.designs.map((d) => [d.label, d.count])).toEqual([]);
    const fromFiles = fieldUsage(daylight, 'nodes', designSamples(project, null));
    expect(fromFiles.designs.map((d) => [d.label, d.count])).toEqual([['one', 1]]);
  });

  it('every successful edit yields a valid schema and a readable label; move reorders', () => {
    let schema = base();
    schema = ok(edit(schema, { type: 'add-field', collection: 'nodes', field: { key: 'public', kind: 'boolean' } }));
    const moved = edit(schema, { type: 'move-field', collection: 'nodes', fieldId: 'public', toIndex: 0 });
    expect(moved.ok && moved.label).toBe('Move node field “public”');
    expect(ok(moved).nodes.map((f) => f.key)).toEqual(['public', 'capacity']);
    expect(parseAttributeSchema(ok(moved)).ok).toBe(true);
  });
});

describe('audit regressions (phase 01 review)', () => {
  it('an edit can only produce a schema that loads again (same rules as stored records)', () => {
    const long = 'x'.repeat(150);
    expect(refused(edit(EMPTY_ATTRIBUTE_SCHEMA, { type: 'add-field', collection: 'nodes', field: { key: 'a', kind: 'text', label: long } }))).toMatch(/label/);
    expect(edit(EMPTY_ATTRIBUTE_SCHEMA, { type: 'add-field', collection: 'nodes', field: { key: 'c', kind: 'enum', values: [''] } }).ok).toBe(false);
    const n = ok(edit(EMPTY_ATTRIBUTE_SCHEMA, { type: 'add-field', collection: 'nodes', field: { key: 'n', kind: 'number' } }));
    expect(edit(n, { type: 'update-field', collection: 'nodes', fieldId: 'n', patch: { min: Infinity } }).ok).toBe(false);
    expect(edit(n, { type: 'set-type-default', function: 'Not A Type', fieldId: 'n', value: 1 }).ok).toBe(false);
  });

  it('case-only renames are refused clearly; new fields get readable labels', () => {
    const s = ok(edit(EMPTY_ATTRIBUTE_SCHEMA, { type: 'add-field', collection: 'nodes', field: { key: 'floorArea', kind: 'number' } }));
    expect(s.nodes[0]!.label).toBe('Floor area');
    expect(refused(edit(s, { type: 'rename-field', collection: 'nodes', fieldId: 'floorArea', key: 'FloorArea' }))).toMatch(/only in upper/);
    const renamed = ok(edit(s, { type: 'rename-field', collection: 'nodes', fieldId: 'floorArea', key: 'area' }));
    const back = ok(edit(renamed, { type: 'rename-field', collection: 'nodes', fieldId: 'floorArea', key: 'FLOORAREA' }));
    expect(back.nodes[0]!.formerKeys).toEqual(['area']);
  });

  it('a different value hidden under a former key is never dropped by a write', () => {
    const renamed = ok(edit(ok(edit(EMPTY_ATTRIBUTE_SCHEMA, { type: 'add-field', collection: 'nodes', field: { key: 'capacity', kind: 'number' } })), { type: 'rename-field', collection: 'nodes', fieldId: 'capacity', key: 'seats' }));
    const field = renamed.nodes[0]!;
    const stored = { seats: 3, capacity: 8 };
    expect(resolveNodeAttributes(renamed, { function: 'g', custom: stored })[0]!.shadowedKeys).toEqual(['capacity']);
    expect(writeFieldValue(field, stored, 4)).toEqual({ seats: 4, capacity: 8 });
    expect(writeFieldValue(field, { capacity: 8 }, 4)).toEqual({ seats: 4 });
    expect(writeFieldValue(field, { seats: 8, capacity: 8 }, 4)).toEqual({ seats: 4 });
  });

  it('a type default that does not fit the project field is reported, not silently ignored', async () => {
    const odd = defineFunction({ id: 'odd', label: 'Odd', custom: { public: { kind: 'text', default: 'yes' } } });
    const project = await labToolkit({ 'toolkits/lab/functions/zz-odd.ts': { default: odd } });
    expect(project.attributeBaseline.diagnostics.some((d) => d.message.includes('default "yes"'))).toBe(true);
  });
});

describe('algorithm reference warnings (heuristic)', () => {
  it('finds quoted and property references in algorithm source', async () => {
    const reads = defineSpatialAlgorithm({
      id: 'reads',
      label: 'Reads',
      run: (ctx) => ({ kind: 'transformation', operations: ctx.design.nodes.filter((n) => n.custom['daylight'] === 'high').map(() => ({ op: 'add-edge', source: 1, target: 2, relationship: 'access' }) as const) }),
    });
    const other = defineGraphAlgorithm({ id: 'other', label: 'Other', inputs: [], run: ({ graph }) => ({ kind: 'analysis', nodeValues: Object.fromEntries(graph.nodes.map((n) => [n.id, 1])) }) });
    const project = await labToolkit({ 'toolkits/lab/algorithms/reads.ts': { default: reads }, 'toolkits/lab/algorithms/other.ts': { default: other } });
    expect(algorithmReferences(project, ['daylight'])).toEqual([{ algorithmId: 'reads', file: 'toolkits/lab/algorithms/reads.ts', keys: ['daylight'] }]);
    expect(algorithmReferences(project, ['capacity'])).toEqual([]);
  });
});

describe('records (persistence and import/export format)', () => {
  it('round-trips through text', async () => {
    const { schema, signature } = (await gallery()).attributeBaseline;
    const text = serializeAttributeRecord(makeAttributeRecord('lab', schema, signature, '2026-11-16T00:00:00.000Z'));
    const read = readAttributeRecord(text, { projectId: 'lab' });
    expect(read.ok && schemaSignature(read.value.schema)).toBe(signature);
    expect(serializeAttributeRecord(read.ok ? read.value : (null as never))).toBe(text);
  });

  it('rejects malformed JSON, foreign formats, unknown versions, other projects and invalid schemas', () => {
    const good = makeAttributeRecord('lab', EMPTY_ATTRIBUTE_SCHEMA, 'x');
    const codeOf = (text: string, allowOtherProject = false) => {
      const r = readAttributeRecord(text, { projectId: 'lab', allowOtherProject });
      return r.ok ? 'ok' : r.issues[0]!.code;
    };
    expect(codeOf('{ nope')).toBe('invalid-attribute-schema');
    expect(codeOf(JSON.stringify({ ...good, format: 'other' }))).toBe('invalid-attribute-schema');
    expect(codeOf(JSON.stringify({ ...good, formatVersion: 2 }))).toBe('attribute-schema-version');
    expect(codeOf(JSON.stringify({ ...good, projectId: 'other' }))).toBe('attribute-schema-project-mismatch');
    expect(codeOf(JSON.stringify({ ...good, projectId: 'other' }), true)).toBe('ok');
    const dup = { nodes: [{ id: 'a', key: 'a', label: 'A', kind: 'text' }, { id: 'b', key: 'A', label: 'B', kind: 'text' }], edges: [], functionDefaults: {} };
    expect(codeOf(JSON.stringify({ ...good, schema: dup }))).toBe('invalid-attribute-schema');
    const reserved = { nodes: [{ id: 'a', key: 'displayId', label: 'A', kind: 'text' }], edges: [], functionDefaults: {} };
    expect(codeOf(JSON.stringify({ ...good, schema: reserved }))).toBe('invalid-attribute-schema');
    const dangling = { nodes: [], edges: [], functionDefaults: { gallery: { nope: 1 } } };
    expect(codeOf(JSON.stringify({ ...good, schema: dangling }))).toBe('invalid-attribute-schema');
  });

  it('merging the baseline is additive and idempotent', async () => {
    const { schema: baseline } = (await gallery()).attributeBaseline;
    const custom = ok(edit(EMPTY_ATTRIBUTE_SCHEMA, { type: 'add-field', collection: 'nodes', field: { key: 'public', kind: 'boolean', label: 'Open to visitors' } }));
    const once = mergeBaseline(custom, baseline);
    expect(once.schema.nodes.map((f) => f.key)).toEqual(['public', 'daylight', 'occupancy']);
    expect(once.schema.nodes[0]!.label).toBe('Open to visitors');
    expect(once.schema.functionDefaults['gallery']).toEqual({ public: true });
    const twice = mergeBaseline(once.schema, baseline);
    expect(twice.added).toEqual([]);
    expect(schemaSignature(twice.schema)).toBe(schemaSignature(once.schema));
  });
});

describe('legacy and round-trip compatibility', () => {
  it('the v1 example migrates and every stored attribute is kept and resolvable', async () => {
    const read = readDesign(exampleV1);
    expect(read.ok).toBe(true);
    const doc = read.ok ? read.value.doc : (null as never);
    const { schema } = (await gallery()).attributeBaseline;
    const store = doc.nodes.find((n) => n.id === 4)! // store;
    expect(store.custom).toEqual({ daylight: null, public: false });
    expect(resolveNodeAttributes(schema, store).find((r) => r.field.key === 'daylight')?.stored).toBe('null');
    // v2 export → import keeps every attribute (no schema information is written to designs).
    const again = readDesignJson(serializeDesignV2(doc));
    expect(again.ok && again.value.doc.nodes.map((n) => n.custom)).toEqual(doc.nodes.map((n) => n.custom));
    expect(serializeDesignV2(doc)).not.toMatch(/functionDefaults|formerKeys/);
  });
});
