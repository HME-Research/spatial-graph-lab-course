import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import houseJson from '@app/document/examples/house.json';
import { ATTRIBUTE_SECTION_IDS } from '@app/attributes/sections';
import { readDesign, serializeDesignV2, validateDocumentV2, type DesignDocumentV2 } from '@app/document';
import { expectOk } from '@app/document/test-fixtures';
import { EMPTY_ATTRIBUTE_SCHEMA, type ProjectAttributeSchema } from '@app/extensions';
import { createMetricEvaluator, DEFAULT_ENABLED_METRICS, enabledMetrics } from '@app/metrics';
import { resolveRelationships, type DesignPort } from '@app/spatial';
import { NO_SELECTION, selectEdge, selectNode, type Selection } from '@core/viewer/selection';
import { VIEW_MODES } from '../contracts';
import type { ProjectViewContext } from '../project';
import { createPanelMemory, PanelMemoryContext } from '../panelMemory';
import { VIEW_COMPONENTS } from '../registry';
import { attributeHeadings, columnGroups, edgeTable, jsonBlocks, jsonLines, nodeTable } from './dataModel';
import { DataView } from './DataView';
import dataViewSource from './DataView.tsx?raw';
import dataModelSource from './dataModel.ts?raw';
import jsonPaneSource from './JsonPane.tsx?raw';
import { DataCellEditorContext, type CellEditorProps } from './cellEditing';

function house(): DesignDocumentV2 {
  const read = readDesign(houseJson);
  if (!read.ok) throw new Error('example house does not load');
  return read.value.doc;
}

/** The house with one stored custom value (room 3) and one explicit "no value" (room 4). */
function houseWithAttributes(): DesignDocumentV2 {
  const doc = house();
  return {
    ...doc,
    nodes: doc.nodes.map((n) => (n.id === 3 ? { ...n, custom: { targetArea: 12 } } : n.id === 4 ? { ...n, custom: { targetArea: null } } : n)),
    edges: doc.edges.map((e) => (e.id === 2 ? { ...e, custom: { note: 'wide door' } } : e)),
  };
}

const SCHEMA: ProjectAttributeSchema = {
  nodes: [{ id: 'f1', key: 'targetArea', label: 'Target area', kind: 'number', default: 6 }],
  edges: [{ id: 'f2', key: 'note', label: 'Note', kind: 'text' }],
  functionDefaults: { kitchen: { f1: 16 }, living: { f1: 20 } },
};

function port(doc: DesignDocumentV2, onCommand = vi.fn()): DesignPort {
  return {
    doc,
    spatial: resolveRelationships(doc),
    onCommand,
    proposeEdit: () => {
      throw new Error('the Data view never proposes edits');
    },
  } as unknown as DesignPort;
}

const inputs = (doc: DesignDocumentV2, schema = SCHEMA) => ({
  ctx: { doc, spatial: resolveRelationships(doc) },
  schema,
  enabled: DEFAULT_ENABLED_METRICS,
  evaluator: createMetricEvaluator(),
});

/** The active toolkit as far as the Data view needs it: its name and the attributes its files declare. */
const TOOLKIT = {
  definition: { name: 'House' },
  attributeBaseline: { schema: { nodes: [{ id: 't1', key: 'targetArea', label: 'Target area', kind: 'number' }], edges: [], functionDefaults: {} } },
  functions: [],
};

describe('data view mode', () => {
  it('is registered as the last view mode, "Data", with a plain (non-lazy) component', () => {
    expect(VIEW_MODES[VIEW_MODES.length - 1]).toBe('data');
    expect(VIEW_COMPONENTS.data).toBe(DataView);
  });
});

describe('JSON lines', () => {
  it('are exactly the exported text (stored values only)', () => {
    const doc = houseWithAttributes();
    const lines = jsonLines(doc);
    expect(lines.map((l) => l.text).join('\n') + '\n').toBe(serializeDesignV2(doc));
    expect(lines.map((l) => l.number)).toEqual(lines.map((_, i) => i + 1));
    // Inherited defaults are not stored, so they never appear.
    expect(lines.some((l) => l.text.includes('16'))).toBe(false);
  });

  it('assign every node and edge record its own lines, braces included, in document order', () => {
    const doc = house();
    const lines = jsonLines(doc);
    for (const [collection, items] of [
      ['nodes', doc.nodes],
      ['edges', doc.edges],
    ] as const) {
      for (const item of items) {
        const own = lines.filter((l) => l.record?.collection === collection && l.record.id === item.id);
        expect(own[0]!.text).toBe('    {');
        expect(own[own.length - 1]!.text.trim()).toMatch(/^},?$/);
        expect(own.some((l) => l.text === `      "id": ${item.id},`)).toBe(true);
        // Contiguous.
        expect(own[own.length - 1]!.number - own[0]!.number + 1).toBe(own.length);
      }
    }
    expect(lines.filter((l) => l.text.includes('"positions"')).every((l) => l.record === null)).toBe(true);
  });

  it('tag lines with their attribute section', () => {
    const lines = jsonLines(houseWithAttributes());
    const node3 = lines.filter((l) => l.record?.collection === 'nodes' && l.record.id === 3);
    const sectionOf = (prefix: string) => node3.find((l) => l.text.trimStart().startsWith(prefix))?.section;
    expect(sectionOf('"id"')).toBe('identity');
    expect(sectionOf('"position"')).toBe('geometry');
    expect(sectionOf('"size"')).toBe('geometry');
    expect(sectionOf('"function"')).toBe('required');
    expect(sectionOf('"custom"')).toBe('custom');
    expect(sectionOf('"targetArea"')).toBe('custom');
    // The inner lines of `custom` (and its closing brace) carry the section of their key.
    expect(node3.find((l) => l.text === '      }')?.section).toBe('custom');
    const edge1 = lines.filter((l) => l.record?.collection === 'edges' && l.record.id === 1);
    expect(edge1.filter((l) => /"(source|target)"/.test(l.text)).every((l) => l.section === 'identity')).toBe(true);
    expect(edge1.find((l) => l.text.includes('"relationship"'))?.section).toBe('required');
    expect(lines.filter((l) => l.record === null).every((l) => l.section === null)).toBe(true);
  });

  it('write the one vocabulary in canonical key order, arrays of numbers on one line', () => {
    const node3 = jsonLines(houseWithAttributes()).filter((l) => l.record?.collection === 'nodes' && l.record.id === 3);
    expect(node3.map((l) => l.text)).toEqual([
      '    {',
      '      "id": 3,',
      '      "function": "kitchen",',
      '      "position": [1, 0, 0],',
      '      "size": [1, 1, 1],',
      '      "custom": {',
      '        "targetArea": 12',
      '      }',
      '    },',
    ]);
    const edge1 = jsonLines(house()).filter((l) => l.record?.collection === 'edges' && l.record.id === 1);
    expect(edge1.map((l) => l.text.trim())).toEqual(['{', '"id": 1,', '"source": 1,', '"target": 2,', '"relationship": "access",', '"custom": {}', '},']);
  });

  it('group into one block per record', () => {
    const doc = house();
    const blocks = jsonBlocks(jsonLines(doc));
    expect(blocks.filter((b) => b.record?.collection === 'nodes').map((b) => b.record!.id)).toEqual(doc.nodes.map((n) => n.id));
    expect(blocks.filter((b) => b.record?.collection === 'edges').map((b) => b.record!.id)).toEqual(doc.edges.map((e) => e.id));
    expect(new Set(blocks.map((b) => b.key)).size).toBe(blocks.length);
  });
});

describe('tables', () => {
  it('group node columns by section, in sections.ts order, calculated last', () => {
    const t = nodeTable(inputs(house()));
    expect(t.columns.slice(0, 8).map((c) => c.label)).toEqual(['ID', 'Function', 'x', 'y', 'z (Level)', 'x', 'y', 'z (Floors)']);
    // Position and Size: ONE heading each over their three value columns; names follow the JSON keys.
    expect(attributeHeadings(t.columns).map((h) => [h.label, h.span])).toEqual([
      ['ID', 1],
      ['Function', 1],
      ['Position', 3],
      ['Size', 3],
      ['Target area', 1],
      ...t.columns.filter((c) => c.section === 'calculated').map((c) => [c.label, 1]),
    ]);
    const order = columnGroups(t.columns).map((g) => g.section);
    expect(order).toEqual(ATTRIBUTE_SECTION_IDS.filter((s) => order.includes(s)));
    expect(order).toEqual(['identity', 'required', 'geometry', 'custom', 'calculated']);
    const calculated = t.columns.filter((c) => c.section === 'calculated').map((c) => c.id);
    expect(calculated).toEqual(enabledMetrics(DEFAULT_ENABLED_METRICS, 'nodes').map((m) => `calc:${m.id}`));
    // By default only Area is shown (owner 2026-11-19); the rest are added from the "+" catalogue.
    expect(calculated).toEqual(['calc:area']);
    expect(t.columns.filter((c) => c.section === 'calculated').every((c) => !c.editable)).toBe(true);
  });

  it('show geometry from position and size, and custom values through the resolver', () => {
    const t = nodeTable(inputs(houseWithAttributes()));
    const row = (id: number) => t.rows.find((r) => r.id === id)!.cells;
    expect([row(4)['position.x']!.text, row(4)['position.y']!.text, row(4)['position.z']!.text]).toEqual(['1', '1', '1']);
    expect([row(4)['size.x']!.text, row(4)['size.y']!.text, row(4)['size.z']!.text]).toEqual(['1', '1', '1']);
    expect(row(3)['custom:f1']).toMatchObject({ text: '12', origin: 'stored' }); // own value beats the kitchen default
    expect(row(4)['custom:f1']).toMatchObject({ text: 'no value', origin: 'stored' }); // explicit null
    expect(row(2)['custom:f1']).toMatchObject({ text: '20', origin: 'type-default' }); // living default
    expect(row(1)['custom:f1']).toMatchObject({ text: '6', origin: 'default' });
    const kitchen = house().nodes.find((n) => n.function === 'kitchen')!.id;
    expect(nodeTable(inputs(house())).rows.find((r) => r.id === kitchen)!.cells['custom:f1']).toMatchObject({ text: '16', origin: 'type-default' });
    for (const r of t.rows) for (const c of t.columns.filter((x) => x.section === 'calculated')) expect(r.cells[c.id]!.origin).toBe('calculated');
  });

  it('show the Function by its current name (a renamed function), with the stored id in the title', () => {
    const kitchen = house().nodes.find((n) => n.function === 'kitchen')!.id;
    const t = nodeTable({ ...inputs(house()), functionName: (id) => (id === 'kitchen' ? 'Cook room' : id) });
    const cells = t.rows.find((r) => r.id === kitchen)!.cells;
    expect(cells['function']).toMatchObject({ text: 'Cook room', title: 'Stored as "kitchen".' });
    expect(cells['custom:f1']!.title).toContain('“Cook room”');
  });

  it('show an edge’s Corridor as two Geometry cells, walls | roof: own values plain, the Corridors card marked default, unused ones marked not built', () => {
    // Edge 1 joins rooms 5 cells apart (a corridor is generated); edge 2 joins touching rooms and stores its own roof.
    const doc = expectOk(
      validateDocumentV2({
        schemaVersion: 2,
        metadata: { name: 'corridor' },
        nodes: [
          { id: 1, position: [0, 0, 0], size: [2, 3, 1], function: 'gallery', custom: {} },
          { id: 2, position: [5, 0, 0], size: [1, 1, 1], function: 'studio', custom: {} },
          { id: 4, position: [0, 3, 0], size: [1, 1, 1], function: 'studio', custom: {} },
        ],
        edges: [
          { id: 1, source: 1, target: 2, relationship: 'access', custom: {} },
          { id: 2, source: 1, target: 4, relationship: 'access', corridor: { roof: 'none' }, custom: {} },
        ],
        diagram: { positions: {} },
        settings: { styleBy: 'function', styles: {}, corridors: { walls: 'enclosed' } },
      }),
    );
    const { ctx } = inputs(doc, EMPTY_ATTRIBUTE_SCHEMA);
    expect(ctx.spatial.byEdge.get(1)?.status).toBe('routed');
    expect(ctx.spatial.byEdge.get(2)?.status).toBe('direct');
    const t = edgeTable(inputs(doc, EMPTY_ATTRIBUTE_SCHEMA));
    const cells = (id: number) => t.rows.find((r) => r.id === id)!.cells;
    expect(cells(1)['corridor.walls']).toMatchObject({ text: 'Enclosed', origin: 'default', hint: 'default' });
    expect(cells(1)['corridor.roof']).toMatchObject({ text: 'Flat', origin: 'default', hint: 'default' });
    expect(cells(2)['corridor.walls']).toMatchObject({ text: 'Enclosed', origin: 'default', hint: 'default · not built' });
    expect(cells(2)['corridor.roof']).toMatchObject({ text: 'None (open top)', origin: 'stored', hint: 'not built' });
    expect(cells(2)['corridor.roof']!.title).toContain('No corridor is generated for this edge now');
    expect(cells(1)['corridor.width']).toMatchObject({ text: '1.5 m', origin: 'default', hint: 'default' });
    // The JSON line of `corridor` belongs to Geometry.
    expect(jsonLines(doc).find((l) => l.record?.collection === 'edges' && l.text.includes('"corridor"'))?.section).toBe('geometry');
  });

  it('show a stored Boundary shift request, marked "not applied" when it cannot apply (rooms not touching)', () => {
    const doc = expectOk(
      validateDocumentV2({
        schemaVersion: 2,
        metadata: { name: 'shift' },
        nodes: [
          { id: 1, position: [0, 0, 0], size: [2, 2, 1], function: 'gallery', custom: {} },
          { id: 2, position: [4, 0, 0], size: [2, 2, 1], function: 'studio', custom: {} },
        ],
        edges: [{ id: 1, source: 1, target: 2, relationship: 'access', boundaryShift: 'toward-target', custom: {} }],
        diagram: { positions: {} },
        settings: { styleBy: 'function', styles: {} },
      }),
    );
    const cell = edgeTable(inputs(doc, EMPTY_ATTRIBUTE_SCHEMA)).rows[0]!.cells.boundaryShift!;
    expect(cell).toMatchObject({ text: 'Toward target', origin: 'stored', hint: 'not applied' });
    expect(cell.title).toContain('Stored on this edge as "boundaryShift": "toward-target".');
    expect(cell.title).toContain('The request is kept.');
    expect(jsonLines(doc).find((l) => l.record?.collection === 'edges' && l.text.includes('"boundaryShift"'))?.section).toBe('geometry');
  });

  it('show edges with "id · Function" endpoints and the relationship label', () => {
    const t = edgeTable(inputs(houseWithAttributes()));
    expect(t.columns.slice(0, 7).map((c) => c.label)).toEqual(['ID', 'Source', 'Target', 'Relationship', 'walls', 'roof', 'width']);
    expect(t.columns.slice(4, 7).map((c) => [c.id, c.section, c.attribute?.label, c.editable])).toEqual([
      ['corridor.walls', 'geometry', 'Corridor', true],
      ['corridor.roof', 'geometry', 'Corridor', true],
      ['corridor.width', 'geometry', 'Corridor', true],
    ]);
    expect(attributeHeadings(t.columns).map((h) => [h.label, h.span])).toContainEqual(['Corridor', 3]);
    // Boundary shift (2026-11-24): a Geometry column after Corridor, like the saved JSON keys.
    expect(t.columns[7]).toMatchObject({ id: 'boundaryShift', label: 'Boundary shift', section: 'geometry', editable: true });
    expect(t.rows.find((r) => r.id === 1)!.cells.boundaryShift).toMatchObject({ text: 'No shift', origin: 'default' });
    const e2 = t.rows.find((r) => r.id === 2)!.cells;
    expect([e2.source!.text, e2.target!.text, e2.relationship!.text]).toEqual(['2 · living', '3 · kitchen', 'Open']);
    expect(t.rows.find((r) => r.id === 2)!.cells['custom:f2']).toMatchObject({ text: 'wide door', origin: 'stored' });
    expect(t.rows.find((r) => r.id === 1)!.cells['custom:f2']).toMatchObject({ text: '—', origin: 'none' });
  });

  it('have no custom group without a project schema', () => {
    expect(columnGroups(nodeTable(inputs(house(), EMPTY_ATTRIBUTE_SCHEMA)).columns).map((g) => g.section)).not.toContain('custom');
  });
});

describe('DataView', () => {
  /** `editor`: a stand-in for the shell's cell editor (`DataCellEditorContext`); none = read-only table. */
  const render = (selection: Selection, format: 'json' | 'table', onCommand = vi.fn(), onSelect = vi.fn(), editor?: (props: CellEditorProps) => null) => {
    const memory = createPanelMemory();
    memory.set('format:data', format);
    const view = createElement(DataView, {
      design: port(houseWithAttributes(), onCommand),
      selection,
      onSelect,
      project: { project: TOOLKIT, conformance: [], facade: () => ({ windowFraction: 0 }), attributes: SCHEMA } as unknown as ProjectViewContext,
    });
    const html = renderToStaticMarkup(
      createElement(PanelMemoryContext.Provider, { value: memory }, editor ? createElement(DataCellEditorContext.Provider, { value: editor }, view) : view),
    );
    return { html, onCommand, onSelect };
  };

  it('remembers the format per panel and offers a labelled JSON | Table toggle', () => {
    const json = render(NO_SELECTION, 'json').html;
    expect(json).toContain('data-data-format="json"');
    expect(json).toContain('aria-label="Show the design as"');
    expect(json).toContain('aria-label="Design as JSON, as saved"');
    expect(json).toContain('Calculated values are not saved; see them in the table.');
    expect(render(NO_SELECTION, 'table').html).toContain('data-data-format="table"');
  });

  it('highlights a selected node record (JSON) and row (table)', () => {
    expect(render(selectNode(4), 'json').html).toMatch(/data-record="nodes:4" data-emphasis="primary"/);
    const table = render(selectNode(4), 'table').html;
    expect(table).toMatch(/data-row="nodes:4" data-id="4" data-emphasis="primary"/);
    expect(table.match(/data-emphasis=/g)).toHaveLength(1);
  });

  it('highlights a selected edge strongly and its two nodes softly', () => {
    const json = render(selectEdge(2), 'json').html;
    expect(json).toMatch(/data-record="edges:2" data-emphasis="primary"/);
    expect(json).toMatch(/data-record="nodes:3" data-emphasis="secondary"/);
    expect(json).toMatch(/data-record="nodes:2" data-emphasis="secondary"/);
    const table = render(selectEdge(2), 'table').html;
    expect(table).toMatch(/data-row="edges:2" data-id="2" data-emphasis="primary"/);
    expect(table).toMatch(/data-row="nodes:3" data-id="3" data-emphasis="secondary"/);
    expect(table).toMatch(/data-row="nodes:2" data-id="2" data-emphasis="secondary"/);
  });

  it('renders section group headers, a locked Calculated group and faded inherited values', () => {
    const table = render(NO_SELECTION, 'table').html;
    for (const title of ['Identity', 'Required', 'Geometry', 'Custom', 'Calculated, not saved']) expect(table).toContain(`>${title}`);
    expect(table).toMatch(/colSpan="3"[^>]*data-attribute="position"[^>]*><span class="sgl-dataview-span-label">Position</);
    // Wrapped like a spreadsheet header: the part in brackets on its own line.
    expect(table).toMatch(/data-column="position.z"[^>]*><span class="sgl-dataview-head">z<span class="sgl-dataview-head-sub">\(Level\)<\/span>/);
    expect(table).toMatch(/data-column="size.z"[^>]*><span class="sgl-dataview-head">z<span class="sgl-dataview-head-sub">\(Floors\)<\/span>/);
    expect(table).toContain('sgl-dataview-lock');
    expect(table).toContain('data-origin="default"');
    expect(table).toContain('from type');
    expect(table).toContain('aria-label="Nodes: one row per node"');
    expect(table).toContain('aria-label="Edges: one row per edge"');
  });

  it('never sends a command itself: edits go only through the provided cell editor', () => {
    const onCommand = vi.fn();
    const editor = vi.fn(() => null);
    for (const sel of [NO_SELECTION, selectNode(2), selectEdge(5)]) for (const f of ['json', 'table'] as const) render(sel, f, onCommand, vi.fn(), editor);
    expect(onCommand).not.toHaveBeenCalled();
    // Nothing is being edited until a cell is clicked (or Enter is pressed on it).
    expect(editor).not.toHaveBeenCalled();
    for (const source of [dataViewSource, dataModelSource]) expect(source).not.toMatch(/onCommand|onScenarioCommand|proposeEdit/);
  });

  it('keeps the JSON read-only: no editor, no editable lines, no command', () => {
    const onCommand = vi.fn();
    const json = render(selectNode(4), 'json', onCommand, vi.fn(), () => null).html;
    expect(json).not.toMatch(/data-editable|<input|<select|contenteditable/);
    expect(json).toContain('Read-only');
    expect(onCommand).not.toHaveBeenCalled();
    expect(jsonPaneSource).not.toMatch(/onCommand|onScenarioCommand|proposeEdit|DataCellEditorContext|cellEditing/);
  });

  it('marks Function, Geometry and Custom cells (and Relationship) editable; Identity and Calculated locked and not focusable', () => {
    const table = render(NO_SELECTION, 'table', vi.fn(), vi.fn(), () => null).html;
    expect(table).toContain('Click a cell to edit');
    const cells = (column: string) => [...table.matchAll(new RegExp(`<t[dh][^>]*data-column="${column}"[^>]*>`, 'g'))].map((m) => m[0]).filter((c) => !c.includes('scope="col"'));
    for (const column of ['function', 'position.x', 'position.y', 'position.z', 'size.x', 'size.y', 'size.z', 'custom:f1', 'relationship', 'corridor.walls', 'corridor.roof', 'corridor.width', 'boundaryShift', 'custom:f2']) {
      expect(cells(column).length, column).toBeGreaterThan(0);
      for (const c of cells(column)) expect(c, column).toMatch(/data-editable="true"[^>]*tabindex="-1"/);
    }
    for (const column of ['id', 'source', 'target', `calc:${enabledMetrics(DEFAULT_ENABLED_METRICS, 'nodes')[0]!.id}`]) {
      expect(cells(column).length, column).toBeGreaterThan(0);
      for (const c of cells(column)) expect(c, column).not.toMatch(/data-editable|tabindex/);
    }
    // Locked columns carry the lock in their header.
    expect(table).toMatch(/data-column="id"[^>]*><span class="sgl-dataview-head">ID<svg class="sgl-dataview-lock"/);
  });

  it('is read-only without a cell editor', () => {
    const table = render(NO_SELECTION, 'table').html;
    expect(table).not.toContain('data-editable');
    expect(table).toContain('Read-only');
  });

  it('tags custom column headers with their source (Toolkit: <name> / Yours)', () => {
    const table = render(NO_SELECTION, 'table').html;
    expect(table).toMatch(/data-column="custom:f1"[^>]*><span class="sgl-dataview-head">Target area<span class="sgl-source-tag sgl-dataview-tag"[^>]*>Toolkit: House<\/span>/);
    expect(table).toMatch(/data-column="custom:f2"[^>]*><span class="sgl-dataview-head">Note<span class="sgl-source-tag sgl-dataview-tag"[^>]*>Yours<\/span>/);
  });
});
