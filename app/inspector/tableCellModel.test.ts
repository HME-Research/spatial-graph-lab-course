import { describe, expect, it } from 'vitest';
import houseJson from '@app/document/examples/house.json';
import { readDesign, type DesignDocumentV2 } from '@app/document';
import type { ProjectAttributeSchema } from '@app/extensions';
import { applyDesignCommand } from '@app/spatial';
import { encodeChoice, EXPLICIT_NONE, INHERIT } from '@app/attributes/attributesModel';
import type { ProjectViewContext } from '@app/views/project';
import { cellCommit, cellEditorSpec } from './tableCellModel';

/** Data view table editing (P4, G): the pure model reuses the Properties models and commands. */

function house(): DesignDocumentV2 {
  const read = readDesign(houseJson);
  if (!read.ok) throw new Error('example house does not load');
  const doc = read.value.doc;
  return {
    ...doc,
    nodes: doc.nodes.map((n) => (n.id === 3 ? { ...n, attributes: { targetArea: 12, keep: 'me' } } : n)),
    edges: doc.edges.map((e) => (e.id === 2 ? { ...e, attributes: { note: 'wide door' } } : e)),
  };
}

const SCHEMA: ProjectAttributeSchema = {
  nodes: [
    { id: 'f1', key: 'targetArea', label: 'Target area', kind: 'number', default: 6, min: 1, max: 100 },
    { id: 'f2', key: 'priority', label: 'Priority', kind: 'enum', values: ['high', 'low'] },
    { id: 'f3', key: 'daylight', label: 'Daylight', kind: 'boolean' },
  ],
  edges: [{ id: 'e1', key: 'note', label: 'Note', kind: 'text' }],
  nodeTypeDefaults: { kitchen: { f1: 16 }, living: { f1: 20 } },
};

const PROJECT = { project: null, conformance: [], facade: () => ({ windowFraction: 0 }), attributes: SCHEMA } as unknown as ProjectViewContext;

const draft = (text: string) => ({ kind: 'draft', text }) as const;
const choice = (value: string) => ({ kind: 'choice', value }) as const;

describe('table cell editors', () => {
  it('are offered for Function, Relationship, Geometry and Custom, never for Identity or Calculated', () => {
    const doc = house();
    for (const id of ['function', 'position-x', 'position-y', 'level', 'size-x', 'size-y', 'floors', 'custom:f1', 'custom:f2', 'custom:f3'])
      expect(cellEditorSpec(doc, PROJECT, 'nodes', 3, id), id).not.toBeNull();
    expect(cellEditorSpec(doc, PROJECT, 'edges', 2, 'relationship')).not.toBeNull();
    expect(cellEditorSpec(doc, PROJECT, 'edges', 2, 'custom:e1')).not.toBeNull();
    for (const id of ['id', 'calc:area', 'source', 'target']) {
      expect(cellEditorSpec(doc, PROJECT, 'nodes', 3, id)).toBeNull();
      expect(cellEditorSpec(doc, PROJECT, 'edges', 2, id)).toBeNull();
    }
    expect(cellCommit(doc, PROJECT, 'nodes', 3, 'id', draft('9')).kind).toBe('invalid');
  });

  it('use the Properties controls: a number field with its range, choice lists with "Use default" and "No value"', () => {
    const doc = house();
    expect(cellEditorSpec(doc, PROJECT, 'nodes', 3, 'custom:f1')).toMatchObject({ kind: 'input', type: 'number', draft: '12', min: 1, max: 100, reset: {} });
    const living = doc.nodes.find((n) => n.id === 2)!; // living: inherits 20
    // Inherited: empty field, the default as placeholder, nothing to reset.
    const inherited = cellEditorSpec(doc, PROJECT, 'nodes', living.id, 'custom:f1');
    expect(inherited).toMatchObject({ kind: 'input', draft: '', placeholder: '20 (default)' });
    expect(inherited).not.toHaveProperty('reset');
    const priority = cellEditorSpec(doc, PROJECT, 'nodes', 3, 'custom:f2');
    expect(priority).toMatchObject({ kind: 'choice', current: INHERIT });
    expect(priority?.kind === 'choice' && priority.options.map((o) => o.label)).toEqual(['Use default (no default)', 'high', 'low', 'No value']);
    expect(cellEditorSpec(doc, PROJECT, 'nodes', 3, 'size-x')).toMatchObject({ kind: 'input', type: 'number', min: 1, max: 32 });
    expect(cellEditorSpec(doc, PROJECT, 'edges', 2, 'relationship')).toMatchObject({ kind: 'choice', options: [{ value: 'access' }, { value: 'open' }] });
  });
});

describe('committing a table cell', () => {
  it('Function: one set-node-type command; an unknown choice is refused', () => {
    const doc = house();
    expect(cellCommit(doc, PROJECT, 'nodes', 3, 'function', choice('bedroom'))).toEqual({ kind: 'command', command: { type: 'set-node-type', nodeId: 3, typeId: 'bedroom' } });
    expect(cellCommit(doc, PROJECT, 'nodes', 3, 'function', choice('kitchen')).kind).toBe('unchanged');
    expect(cellCommit(doc, PROJECT, 'nodes', 3, 'function', choice('garage')).kind).toBe('invalid');
    // Without a project any valid id may be typed (Properties' "Other type…"); a bad id is refused.
    expect(cellCommit(doc, PROJECT, 'nodes', 3, 'function', draft('garage'))).toMatchObject({ kind: 'command', command: { typeId: 'garage' } });
    expect(cellCommit(doc, PROJECT, 'nodes', 3, 'function', draft('Garage!'))).toMatchObject({ kind: 'invalid', issue: { message: expect.stringMatching(/lowercase/) } });
  });

  it('Relationship: one change-edge-kind command', () => {
    const doc = house();
    const edge = doc.edges.find((e) => e.kind === 'access')!;
    expect(cellCommit(doc, PROJECT, 'edges', edge.id, 'relationship', choice('open'))).toEqual({ kind: 'command', command: { type: 'change-edge-kind', edgeId: edge.id, kind: 'open' } });
    expect(cellCommit(doc, PROJECT, 'edges', edge.id, 'relationship', choice('access')).kind).toBe('unchanged');
  });

  it('Geometry: one axis becomes a whole-geometry request for the Properties preview path', () => {
    const doc = house();
    const node = doc.nodes.find((n) => n.id === 3)!;
    expect(cellCommit(doc, PROJECT, 'nodes', 3, 'size-x', draft(String(node.size[0] + 1)))).toEqual({
      kind: 'geometry',
      nodeId: 3,
      request: { size: [node.size[0] + 1, node.size[1], node.size[2]] },
      action: 'resize',
    });
    expect(cellCommit(doc, PROJECT, 'nodes', 3, 'level', draft('3'))).toMatchObject({ kind: 'geometry', request: { grid: [node.grid[0], node.grid[1], 3] }, action: 'move' });
    expect(cellCommit(doc, PROJECT, 'nodes', 3, 'size-x', draft(String(node.size[0]))).kind).toBe('unchanged');
    expect(cellCommit(doc, PROJECT, 'nodes', 3, 'size-x', draft('0'))).toMatchObject({ kind: 'invalid', issue: { message: 'Size X must be from 1 to 32.' } });
    expect(cellCommit(doc, PROJECT, 'nodes', 3, 'position-x', draft('1.5'))).toMatchObject({ kind: 'invalid', issue: { message: 'Position X must be a whole number.' } });
  });

  it('Custom: overrides an inherited value, refuses an invalid one, keeps the other stored values', () => {
    const doc = house();
    const living = doc.nodes.find((n) => n.id === 2)!; // living: inherits 20
    const set = cellCommit(doc, PROJECT, 'nodes', living.id, 'custom:f1', draft('24'));
    expect(set).toEqual({ kind: 'command', command: { type: 'set-node-attributes', nodeId: living.id, attributes: { ...living.attributes, targetArea: 24 } } });
    // The command is valid: applying it gives the room its own value.
    const applied = applyDesignCommand(doc, (set as { command: Parameters<typeof applyDesignCommand>[1] }).command);
    expect(applied.ok).toBe(true);

    expect(cellCommit(doc, PROJECT, 'nodes', 3, 'custom:f1', draft('abc'))).toMatchObject({ kind: 'invalid', issue: { path: ['attributes', 'targetArea'] } });
    expect(cellCommit(doc, PROJECT, 'nodes', 3, 'custom:f1', draft('500'))).toMatchObject({ kind: 'invalid', issue: { message: expect.stringContaining('Target area') } });
    expect(cellCommit(doc, PROJECT, 'nodes', 3, 'custom:f1', draft('30'))).toMatchObject({ command: { attributes: { targetArea: 30, keep: 'me' } } });
    // Unchanged text and an empty field on an inherited value send nothing.
    expect(cellCommit(doc, PROJECT, 'nodes', 3, 'custom:f1', draft('12')).kind).toBe('unchanged');
    expect(cellCommit(doc, PROJECT, 'nodes', living.id, 'custom:f1', draft('')).kind).toBe('unchanged');
  });

  it('Custom: "Use default" (reset or an emptied field) removes only the own value', () => {
    const doc = house();
    const reset = { command: { type: 'set-node-attributes', nodeId: 3, attributes: { keep: 'me' } } };
    expect(cellCommit(doc, PROJECT, 'nodes', 3, 'custom:f1', { kind: 'reset' })).toMatchObject(reset);
    expect(cellCommit(doc, PROJECT, 'nodes', 3, 'custom:f1', draft(''))).toMatchObject(reset);
    expect(cellCommit(doc, PROJECT, 'nodes', 1, 'custom:f1', { kind: 'reset' }).kind).toBe('unchanged');
  });

  it('Custom choices: a value, "No value" (null) and "Use default"; edges too', () => {
    const doc = house();
    expect(cellCommit(doc, PROJECT, 'nodes', 3, 'custom:f2', choice(encodeChoice('high')))).toMatchObject({ command: { attributes: { targetArea: 12, keep: 'me', priority: 'high' } } });
    expect(cellCommit(doc, PROJECT, 'nodes', 3, 'custom:f3', choice(EXPLICIT_NONE))).toMatchObject({ command: { attributes: { daylight: null } } });
    expect(cellCommit(doc, PROJECT, 'nodes', 3, 'custom:f3', choice(INHERIT)).kind).toBe('unchanged');
    expect(cellCommit(doc, PROJECT, 'nodes', 3, 'custom:f2', choice(encodeChoice('medium'))).kind).toBe('invalid');
    expect(cellCommit(doc, PROJECT, 'edges', 2, 'custom:e1', draft('narrow'))).toEqual({ kind: 'command', command: { type: 'set-edge-attributes', edgeId: 2, attributes: { note: 'narrow' } } });
  });
});
