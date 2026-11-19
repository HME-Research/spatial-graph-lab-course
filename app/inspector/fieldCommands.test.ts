import { describe, expect, it } from 'vitest';
import { readDesign } from '@app/document';
import { applySchemaEdit, EMPTY_ATTRIBUTE_SCHEMA, effectiveNodeValues, type ProjectAttributeSchema } from '@app/extensions';
import { applyDesignCommand, resolveRelationships } from '@app/spatial';
import { isStale } from '@app/session/algorithmSession';
import { modelFromV2 } from '@app/views/graph2d/diagramModel';
import { setEdgeFieldCommand, setNodeFieldCommand } from './fieldCommands';

/** Phase 02: instance value commands (set / explicit no value / clear to inherited) and view reads. */

const schema: ProjectAttributeSchema = (() => {
  let s = EMPTY_ATTRIBUTE_SCHEMA;
  for (const e of [
    { type: 'add-field', collection: 'nodes', field: { key: 'capacity', kind: 'number', min: 0, default: 10 } },
    { type: 'add-field', collection: 'edges', field: { key: 'weight', kind: 'number' } },
    { type: 'set-type-default', typeId: 'gallery', fieldId: 'capacity', value: 30 },
  ] as const) {
    const r = applySchemaEdit(s, e);
    if (!r.ok) throw new Error(r.reason);
    s = r.schema;
  }
  return s;
})();

const doc = (() => {
  const r = readDesign({
    schemaVersion: 2,
    metadata: { name: 'x' },
    nodes: [
      { id: 1, grid: [0, 0, 0], typeId: 'gallery', attributes: { other: 'kept' } },
      { id: 2, grid: [3, 0, 0], typeId: 'studio' },
    ],
    edges: [{ id: 1, source: 1, target: 2, kind: 'open' }],
  });
  if (!r.ok) throw new Error('bad');
  return r.value.doc;
})();

describe('field commands', () => {
  const capacity = schema.nodes[0]!;
  const weight = schema.edges[0]!;

  it('override, explicit no value and clear-to-inherited are one command each and keep other values', () => {
    const g = doc.nodes[0]!;
    const set = setNodeFieldCommand(g, capacity, 5);
    if (!set.ok) throw new Error(set.message);
    const after = applyDesignCommand(doc, set.command);
    if (!after.ok) throw new Error('rejected');
    expect(after.value.nodes[0]!.attributes).toEqual({ other: 'kept', capacity: 5 });
    expect(effectiveNodeValues(schema, after.value.nodes[0]!)['capacity']).toBe(5);
    const none = setNodeFieldCommand(after.value.nodes[0]!, capacity, null);
    expect(none.ok && none.command).toMatchObject({ attributes: { other: 'kept', capacity: null } });
    const cleared = setNodeFieldCommand(after.value.nodes[0]!, capacity, undefined);
    expect(cleared.ok && cleared.command).toMatchObject({ attributes: { other: 'kept' } });
    expect(effectiveNodeValues(schema, g)['capacity']).toBe(30); // inherited type default
  });

  it('refuses invalid values with the field label; edges use set-edge-attributes', () => {
    expect(setNodeFieldCommand(doc.nodes[0]!, capacity, -1)).toEqual({ ok: false, message: '“Capacity” must be a number ≥ 0' });
    const r = setEdgeFieldCommand(doc.edges[0]!, weight, 2);
    expect(r.ok && r.command).toEqual({ type: 'set-edge-attributes', edgeId: 1, attributes: { weight: 2 } });
  });
});

describe('views and staleness', () => {
  it('Graph 2D shows effective values (type default) and legacy keys', () => {
    const model = modelFromV2(doc, resolveRelationships(doc), schema);
    expect(model.nodes.map((n) => n.attributes)).toEqual([{ capacity: 30, other: 'kept' }, { capacity: 10 }]);
  });

  it('a result is stale after a project attribute change', () => {
    const run = { doc, revision: 1, attributesRevision: 4 };
    expect(isStale(run, { doc, revision: 1 }, 4)).toBe(false);
    expect(isStale(run, { doc, revision: 1 }, 5)).toBe(true);
    expect(isStale({ doc, revision: 1 }, { doc, revision: 1 }, 5)).toBe(false);
  });
});
