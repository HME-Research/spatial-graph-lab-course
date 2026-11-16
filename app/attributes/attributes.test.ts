import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { applySchemaEdit, EMPTY_ATTRIBUTE_SCHEMA, resolveNodeAttributes, type ProjectAttributeSchema, type SchemaEdit } from '@app/extensions';
import { labProject } from '@app/extensions/test-fixtures';
import { loadAttributeSession } from '@app/session/projectAttributeStore';
import { readDesign } from '@app/document/v2';
import { decodeChoice, encodeChoice, EXPLICIT_NONE, inheritedText, INHERIT, parseChoices, parseValueDraft, sourceText, typeChoices } from './attributesModel';
import { AttributesPanel } from './AttributesPanel';
import { CustomAttributes } from './CustomAttributes';

/** Phase 03: Attributes manager and custom attributes in Properties. */

const schemaOf = (...edits: SchemaEdit[]): ProjectAttributeSchema =>
  edits.reduce((s, e) => {
    const r = applySchemaEdit(s, e);
    if (!r.ok) throw new Error(r.reason);
    return r.schema;
  }, EMPTY_ATTRIBUTE_SCHEMA);

const schema = schemaOf(
  { type: 'add-field', collection: 'nodes', field: { key: 'capacity', kind: 'number', min: 0, default: 10 } },
  { type: 'add-field', collection: 'nodes', field: { key: 'public', kind: 'boolean' } },
  { type: 'set-type-default', typeId: 'gallery', fieldId: 'public', value: true },
  { type: 'add-field', collection: 'edges', field: { key: 'weight', kind: 'number' } },
);

describe('attributes model', () => {
  it('parses drafts by kind and checks them against the field', () => {
    const capacity = schema.nodes[0]!;
    expect(parseValueDraft(capacity, ' 12 ')).toEqual({ ok: true, value: 12 });
    expect(parseValueDraft(capacity, '')).toEqual({ ok: true, value: undefined });
    expect(parseValueDraft(capacity, '-3')).toEqual({ ok: false, message: '“Capacity” must be a number ≥ 0' });
    expect(parseValueDraft(capacity, 'many').ok).toBe(false);
    expect(parseValueDraft(schema.nodes[1]!, 'true')).toEqual({ ok: true, value: true });
    expect(parseChoices(' a, b,,c ')).toEqual(['a', 'b', 'c']);
  });

  it('encodes choices so sentinel strings never collide with values', () => {
    for (const v of ['inherit', 'null', 'v:x', true, 0]) expect(decodeChoice(encodeChoice(v))).toBe(v);
    expect(decodeChoice(INHERIT)).toBeUndefined();
    expect(decodeChoice(EXPLICIT_NONE)).toBeNull();
  });

  it('names the source of an effective value and what "Use default" returns to', () => {
    const [cap, pub] = resolveNodeAttributes(schema, { typeId: 'gallery', attributes: { capacity: 4 } });
    expect(sourceText(cap!, 'gallery').chip).toBe('set here');
    expect(inheritedText(cap!, 'gallery')).toBe('field default 10');
    expect(sourceText(pub!, 'gallery').chip).toBe('gallery default');
    const [none] = resolveNodeAttributes(schema, { typeId: 'gallery', attributes: { capacity: null } });
    expect(sourceText(none!).chip).toBe('set to no value');
  });

  it('offers project types plus types used in the design', async () => {
    const project = await labProject();
    expect(typeChoices(project, ['kiosk', 'gallery']).map((t) => t.id)).toEqual(['gallery', 'kiosk', 'studio']);
  });
});

describe('custom attributes in Properties', () => {
  const render = (collection: 'nodes' | 'edges', item: object) =>
    renderToStaticMarkup(createElement(CustomAttributes, { collection, item: item as never, schema, run: () => true, onError: () => {}, onManage: () => {} }));

  it('lists every project field with its effective source; legacy values separately', () => {
    const html = render('nodes', { id: 'g', typeId: 'gallery', attributes: { capacity: 4, legacy: 'kept' } });
    expect(html).toContain('Capacity');
    expect(html).toContain('set here');
    expect(html).toContain('gallery default');
    expect(html).toContain('Use default');
    expect(html).toContain('Not in the project fields (1)');
    expect(html).toContain('Manage attributes');
  });

  it('edges show the edge fields only, and an invalid stored value is flagged but kept', () => {
    const html = render('edges', { id: 'e', attributes: { weight: 'heavy' } });
    expect(html).toContain('weight');
    expect(html).not.toContain('capacity');
    expect(html).toContain('invalid stored value');
    expect(html).toContain('is kept until you change it');
  });
});

describe('Attributes manager', () => {
  it('shows the project fields with Nodes/Edges lists, history and file actions', async () => {
    const project = await labProject();
    const session = loadAttributeSession(null, project);
    const doc = readDesign({ schemaVersion: 2, metadata: { name: 'd' }, nodes: [{ id: 'a', grid: [0, 0, 0], typeId: 'gallery', attributes: { daylight: 'high' } }], edges: [] });
    const html = renderToStaticMarkup(
      createElement(AttributesPanel, { session, project, doc: doc.ok ? doc.value.doc : null, source: 'd.json', onChange: () => {} }),
    );
    for (const text of ['Node <span class="sgl-htab-count">(3)</span>', 'Edge <span class="sgl-htab-count">(0)</span>', 'role="tablist" aria-orientation="horizontal"', 'System fields', 'Function', 'Level', 'daylight', 'public', 'occupancy', 'Undo field change', 'Export fields…', 'Import fields…', 'Add a node field', 'Default per room type', '1 in d (open)']) {
      expect(html).toContain(text);
    }
    expect(html).toContain('Same as the project files.');
  });

  it('without a project explains that fields belong to a project', () => {
    const html = renderToStaticMarkup(createElement(AttributesPanel, { session: null, project: null, doc: null, source: null, onChange: () => {} }));
    expect(html).toContain('custom fields belong to a project');
  });
});
