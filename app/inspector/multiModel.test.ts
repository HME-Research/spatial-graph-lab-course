import { describe, expect, it } from 'vitest';
import { readDesign } from '@app/document';
import { expectOk } from '@app/document/test-fixtures';
import { applySchemaEdit, effectiveNodeValues, EMPTY_ATTRIBUTE_SCHEMA, type ProjectAttributeSchema } from '@app/extensions';
import { applyDesignCommand } from '@app/spatial';
import { designCommandLabel } from '@app/session/documentSession';
import type { DesignCommand } from '@app/spatial';
import { multiFieldCommand, resolveMulti, sharedValue, storedStateOf, type MultiCommandResult } from './multiModel';

function commandOf(result: MultiCommandResult): DesignCommand {
  if (!result.ok || result.command === null) throw new Error('expected a command');
  return result.command;
}

/** Multi-selection editing (2026-11-23): every single-item attribute edit, for several items in one step. */

const schema: ProjectAttributeSchema = (() => {
  let s = EMPTY_ATTRIBUTE_SCHEMA;
  for (const e of [
    { type: 'add-field', collection: 'nodes', field: { key: 'capacity', kind: 'number', min: 0, default: 10 } },
    { type: 'add-field', collection: 'edges', field: { key: 'weight', kind: 'number' } },
    { type: 'set-type-default', function: 'gallery', fieldId: 'capacity', value: 30 },
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
      { id: 1, position: [0, 0, 0], function: 'gallery', custom: { other: 'kept', capacity: 5 } },
      { id: 2, position: [3, 0, 0], function: 'studio' },
      { id: 3, position: [6, 0, 0], function: 'studio', custom: { capacity: 5 } },
    ],
    edges: [
      { id: 1, source: 1, target: 2, relationship: 'open', custom: { weight: 2 } },
      { id: 2, source: 2, target: 3, relationship: 'access', corridor: { walls: 'open' } },
    ],
  });
  if (!r.ok) throw new Error('bad');
  return r.value.doc;
})();

describe('multi-selection attribute model', () => {
  const capacity = schema.nodes[0]!;
  const weight = schema.edges[0]!;

  it('reports a value shared by all items, or mixed with the distinct values', () => {
    expect(sharedValue(['a', 'a'])).toEqual({ kind: 'same', value: 'a' });
    expect(sharedValue(['a', 'b', 'a'])).toEqual({ kind: 'mixed', values: ['"a"', '"b"'] });
    const resolved = resolveMulti(schema, 'nodes', doc.nodes).get(capacity.id)!;
    expect(resolved.map(storedStateOf)).toEqual([{ kind: 'value', value: 5 }, { kind: 'inherit' }, { kind: 'value', value: 5 }]);
  });

  it('sets one custom value on every node in ONE command, keeping their other values', () => {
    const result = multiFieldCommand('nodes', doc.nodes, capacity, 12);
    expect(result.ok && result.command?.type).toBe('set-nodes-custom');
    const next = expectOk(applyDesignCommand(doc, commandOf(result)));
    expect(next.nodes.map((n) => n.custom)).toEqual([{ other: 'kept', capacity: 12 }, { capacity: 12 }, { capacity: 12 }]);
    expect(designCommandLabel(commandOf(result), doc)).toBe('Edit the attributes of 3 nodes');
  });

  it('"Use default" clears every own value so each Function default applies again', () => {
    const result = multiFieldCommand('nodes', doc.nodes, capacity, undefined);
    const next = expectOk(applyDesignCommand(doc, commandOf(result)));
    expect(next.nodes.map((n) => n.custom)).toEqual([{ other: 'kept' }, {}, {}]);
    expect(next.nodes.map((n) => effectiveNodeValues(schema, n).capacity)).toEqual([30, 10, 10]);
  });

  it('refuses an invalid value and sends nothing when no item would change', () => {
    expect(multiFieldCommand('nodes', doc.nodes, capacity, -1)).toEqual({ ok: false, message: expect.stringContaining('Capacity') });
    expect(multiFieldCommand('nodes', [doc.nodes[0]!, doc.nodes[2]!], capacity, 5)).toEqual({ ok: true, command: null });
  });

  it('edits edge custom values, Relationship and corridor of several edges, each in one step', () => {
    const custom = multiFieldCommand('edges', doc.edges, weight, null);
    const a = expectOk(applyDesignCommand(doc, commandOf(custom)));
    expect(a.edges.map((e) => e.custom)).toEqual([{ weight: null }, { weight: null }]);

    const kind = expectOk(applyDesignCommand(doc, { type: 'set-edges-kind', edgeIds: [1, 2], relationship: 'access' }));
    expect(kind.edges.map((e) => e.relationship)).toEqual(['access', 'access']);

    const corridor = expectOk(applyDesignCommand(doc, { type: 'set-edges-corridor', edgeIds: [1, 2], patch: { roof: 'pergola', walls: null } }));
    expect(corridor.edges.map((e) => e.corridor)).toEqual([{ roof: 'pergola' }, { roof: 'pergola' }]);
    expect(designCommandLabel({ type: 'set-edges-kind', edgeIds: [1, 2], relationship: 'open' }, doc)).toBe('Change 2 edges to Open');
  });

  it('refuses empty lists and unknown ids without change', () => {
    expect(applyDesignCommand(doc, { type: 'set-edges-kind', edgeIds: [], relationship: 'open' }).ok).toBe(false);
    expect(applyDesignCommand(doc, { type: 'set-edges-corridor', edgeIds: [1, 9], patch: { width: 1 } }).ok).toBe(false);
    expect(applyDesignCommand(doc, { type: 'set-nodes-custom', custom: { 42: {} } }).ok).toBe(false);
    expect(applyDesignCommand(doc, { type: 'set-edges-custom', custom: {} }).ok).toBe(false);
  });
});
