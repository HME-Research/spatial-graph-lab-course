import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { applySchemaEdit, EMPTY_ATTRIBUTE_SCHEMA, resolveNodeAttributes, withProjectFunctions, PROJECT_FUNCTIONS_FILE, type ProjectAttributeSchema, type SchemaEdit } from '@app/extensions';
import { labToolkit } from '@app/extensions/test-fixtures';
import { canUndoAttributes, currentSchema, editAttributesBatch, loadAttributeSession, undoAttributes } from '@app/session/projectAttributeStore';
import { readDesign } from '@app/document';
import { readProjectFile, serializeProjectFile } from '@app/project';
import { fileOf } from '@app/session/projectStore.fixtures';
import { DEFAULT_ENABLED_METRICS, METRIC_CATALOGUE } from '@app/metrics';
import { decodeChoice, encodeChoice, EXPLICIT_NONE, inheritedText, INHERIT, parseChoices, parseValueDraft, sourceText, typeChoices } from './attributesModel';
import {
  attributeNameProblem,
  attributeRows,
  availableCalculated,
  functionNameProblem,
  functionRows,
  generateAttributeKey,
  generateFunctionId,
  keyHasIncompatibleValues,
  keyStem,
  scenarioSamples,
  sectionedRows,
  storedValueCount,
  toolkitMergeNotice,
} from './attributeList';

describe('Add toolkit attributes notice', () => {
  it('counts attributes and Function defaults separately (house: 2 attributes, 12 defaults)', () => {
    const added = [
      'node field "targetArea"',
      'node field "priority"',
      ...['living', 'kitchen', 'bedroom', 'bath', 'entrance', 'circulation'].flatMap((t) => [
        `default of "targetArea" for type "${t}"`,
        `default of "priority" for type "${t}"`,
      ]),
    ];
    expect(toolkitMergeNotice(added)).toBe('Added 2 attributes and 12 Function defaults from the toolkit.');
    expect(toolkitMergeNotice(['edge field "width"'])).toBe('Added 1 attribute from the toolkit.');
    expect(toolkitMergeNotice(['default of "priority" for type "bath"'])).toBe('Added 1 Function default from the toolkit.');
    expect(toolkitMergeNotice([])).toBe('Nothing new to add from the toolkit.');
  });
});
import { EDGE_BUILT_IN_ATTRIBUTES, NODE_BUILT_IN_ATTRIBUTES } from './sections';
import { AddAttributeDialog, AttributeInfoDialog, DeleteAttributeDialog, EditAttributeDialog, studentMessage } from './AttributeDialogs';
import { AttributesPanel } from './AttributesPanel';
import { CustomAttributes } from './CustomAttributes';
import { FunctionsDialog } from './FunctionsDialog';

/** Attributes (UI refinement 2026-11-17): one unified list, dialogs, identifiers, functions. */

const schemaOf = (...edits: SchemaEdit[]): ProjectAttributeSchema =>
  edits.reduce((s, e) => {
    const r = applySchemaEdit(s, e);
    if (!r.ok) throw new Error(r.reason);
    return r.schema;
  }, EMPTY_ATTRIBUTE_SCHEMA);

const schema = schemaOf(
  { type: 'add-field', collection: 'nodes', field: { key: 'capacity', kind: 'number', min: 0, default: 10 } },
  { type: 'add-field', collection: 'nodes', field: { key: 'public', kind: 'boolean' } },
  { type: 'set-type-default', function: 'gallery', fieldId: 'public', value: true },
  { type: 'add-field', collection: 'edges', field: { key: 'weight', kind: 'number' } },
);

const docOf = (attributes: Record<string, unknown>) => {
  const r = readDesign({ schemaVersion: 2, metadata: { name: 'd' }, nodes: [{ id: 1, position: [0, 0, 0], function: 'gallery', custom: attributes }], edges: [] });
  if (!r.ok) throw new Error('design');
  return r.value.doc;
};

describe('attributes model (values)', () => {
  it('parses drafts by type and checks them against the attribute', () => {
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
    const [cap, pub] = resolveNodeAttributes(schema, { function: 'gallery', custom: { capacity: 4 } });
    expect(sourceText(cap!, 'gallery').chip).toBe('set here');
    expect(inheritedText(cap!, 'gallery')).toBe('default 10');
    expect(sourceText(pub!, 'gallery').chip).toBe('gallery default');
    const [none] = resolveNodeAttributes(schema, { function: 'gallery', custom: { capacity: null } });
    expect(sourceText(none!).chip).toBe('set to no value');
  });

  it('offers project types plus types used in the design', async () => {
    const project = await labToolkit();
    expect(typeChoices(project, ['kiosk', 'gallery']).map((t) => t.id)).toEqual(['gallery', 'kiosk', 'studio']);
  });
});

describe('unified attribute list', () => {
  it('Node: the five sections in order — Identity, Required, Geometry, Custom (project order), Calculated (catalogue order)', () => {
    const rows = attributeRows('nodes', schema, ['degree', 'area', 'route-length']);
    expect(rows.map((r) => `${r.kind}:${r.name}:${r.typeText}`)).toEqual([
      'identity:ID:Number',
      'required:Function:Choice',
      'geometry:Position:Numbers x | y | z',
      'geometry:Size:Numbers x | y | z',
      'custom:Capacity:Number',
      'custom:Public:Yes/No',
      'calculated:Area:Calculated',
      'calculated:Degree:Calculated',
    ]);
    // Membership and order follow sections.ts exactly.
    expect(rows.filter((r) => r.kind !== 'custom' && r.kind !== 'calculated').map((r) => r.id)).toEqual(NODE_BUILT_IN_ATTRIBUTES.map((a) => a.id));
    expect(sectionedRows(rows).map((g) => g.section)).toEqual(['identity', 'required', 'geometry', 'custom', 'calculated']);
    // Empty sections are left out.
    expect(sectionedRows(attributeRows('nodes', EMPTY_ATTRIBUTE_SCHEMA, [])).map((g) => g.section)).toEqual(['identity', 'required', 'geometry']);
  });

  it('Edge: Identity (ID, Source, Target), then Relationship, nothing invented, no Geometry, then edge attributes', () => {
    // Area (the only default) is a room value: by default an edge shows no calculated values.
    expect(attributeRows('edges', schema, DEFAULT_ENABLED_METRICS).some((r) => r.kind === 'calculated')).toBe(false);
    const rows = attributeRows('edges', schema, [...DEFAULT_ENABLED_METRICS, 'resolution-status']);
    expect(rows.slice(0, 4).map((r) => `${r.kind}:${r.name}`)).toEqual(['identity:ID', 'identity:Source', 'identity:Target', 'required:Relationship']);
    expect(rows.filter((r) => r.kind === 'required')).toHaveLength(1);
    expect(rows.some((r) => r.kind === 'geometry')).toBe(false);
    expect(rows.filter((r) => r.kind !== 'custom' && r.kind !== 'calculated').map((r) => r.id)).toEqual(EDGE_BUILT_IN_ATTRIBUTES.map((a) => a.id));
    expect(rows.map((r) => r.name)).toContain('Weight');
    expect(rows.find((r) => r.kind === 'calculated')).toMatchObject({ id: 'resolution-status' });
  });

  it('offers only calculated attributes that are not shown yet, searchable by name or definition', () => {
    const shown = ['area'];
    const available = availableCalculated('nodes', shown);
    expect(available.map((m) => m.id)).not.toContain('area');
    expect(available.length).toBe(METRIC_CATALOGUE.filter((m) => m.collection === 'nodes').length - 1);
    expect(availableCalculated('nodes', shown, 'facade').every((m) => /fa[cç]ade/i.test(m.label + m.definition))).toBe(true);
    expect(availableCalculated('nodes', shown, 'zzz')).toEqual([]);
  });
});

describe('names and identifiers', () => {
  it('refuses empty, duplicate (ignoring case and spaces), required and calculated names', () => {
    expect(attributeNameProblem('  ', 'nodes', schema)).toMatch(/Enter a name/);
    expect(attributeNameProblem('capacity ', 'nodes', schema)).toMatch(/already an attribute called “Capacity”/);
    expect(attributeNameProblem('Capacity', 'nodes', schema, 'capacity')).toBeNull(); // its own name
    expect(attributeNameProblem('function', 'nodes', schema)).toMatch(/required attribute/);
    expect(attributeNameProblem('AREA', 'nodes', schema)).toMatch(/calculated attribute/);
    expect(attributeNameProblem('Area', 'edges', schema)).toBeNull(); // Area is a node calculation only
    expect(attributeNameProblem('x'.repeat(61), 'nodes', schema)).toMatch(/at most 60/);
  });

  it('generates a safe identifier from the name; students never type it', () => {
    expect(keyStem('Floor finish')).toBe('floor_finish');
    expect(keyStem('Façade área!')).toBe('facade_area');
    expect(keyStem('2nd exit')).toBe('a_2nd_exit');
    expect(keyStem('面积')).toBe('attribute');
    expect(generateAttributeKey('Floor finish', schema, 'nodes')).toBe('floor_finish');
    // Collisions with existing keys (any case) and reserved words get a suffix.
    expect(generateAttributeKey('CAPACITY', schema, 'nodes')).toBe('capacity_2');
    expect(generateAttributeKey('Type', schema, 'nodes')).toBe('type_2');
    expect(generateAttributeKey('Id', schema, 'edges')).toBe('id_2');
    // Former keys are taken too.
    const renamed = schemaOf({ type: 'add-field', collection: 'nodes', field: { key: 'size_m', kind: 'number' } }, { type: 'rename-field', collection: 'nodes', fieldId: 'size_m', key: 'span' });
    expect(generateAttributeKey('size m', renamed, 'nodes')).toBe('size_m_2');
  });

  it('reuses a key whose leftover values fit, and avoids one whose values would not', () => {
    const samples = scenarioSamples([{ id: 's1', name: 'A', doc: docOf({ daylight: 'high' }) }]);
    expect(keyHasIncompatibleValues(samples, 'nodes', 'daylight', { kind: 'text' })).toBe(false);
    expect(keyHasIncompatibleValues(samples, 'nodes', 'daylight', { kind: 'number' })).toBe(true);
    expect(generateAttributeKey('Daylight', EMPTY_ATTRIBUTE_SCHEMA, 'nodes', (k) => keyHasIncompatibleValues(samples, 'nodes', k, { kind: 'number' }))).toBe('daylight_2');
    expect(generateAttributeKey('Daylight', EMPTY_ATTRIBUTE_SCHEMA, 'nodes', (k) => keyHasIncompatibleValues(samples, 'nodes', k, { kind: 'text' }))).toBe('daylight');
  });

  it('keeps the identifier when the display name changes (stored values stay attached)', () => {
    const next = schemaOf({ type: 'add-field', collection: 'nodes', field: { key: 'floor_finish', label: 'Floor finish', kind: 'text' } }, { type: 'update-field', collection: 'nodes', fieldId: 'floor_finish', patch: { label: 'Finish of the floor' } });
    expect(next.nodes[0]).toMatchObject({ key: 'floor_finish', label: 'Finish of the floor' });
    expect(resolveNodeAttributes(next, { function: 'x', custom: { floor_finish: 'oak' } })[0]!.value).toBe('oak');
  });

  it('counts stored values across every scenario', () => {
    const samples = scenarioSamples([
      { id: 's1', name: 'A', doc: docOf({ capacity: 3 }) },
      { id: 's2', name: 'B', doc: docOf({ capacity: null }) },
      { id: 's3', name: 'C', doc: docOf({}) },
    ]);
    expect(storedValueCount(schema.nodes[0]!, 'nodes', samples)).toEqual({ total: 2, designs: 2 });
  });

  it('speaks student vocabulary in refusals', () => {
    expect(studentMessage('a choice field needs at least one value')).toBe('A choice attribute needs at least one option.');
    expect(studentMessage('“x” cannot become Number: 2 stored values would not be a number')).toMatch(/\.$/);
  });
});

describe('batched attribute edits (one dialog Save = one Undo step)', () => {
  it('applies every edit as ONE history step, all or nothing', async () => {
    const project = await labToolkit();
    const session = loadAttributeSession(null, project);
    const ok = editAttributesBatch(
      session,
      [
        { type: 'add-field', collection: 'nodes', field: { key: 'finish', label: 'Finish', kind: 'text' } },
        { type: 'update-field', collection: 'nodes', fieldId: 'finish', patch: { description: 'Floor material' } },
      ],
      'Add attribute “Finish”',
    );
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(currentSchema(ok.session).nodes.find((f) => f.key === 'finish')).toMatchObject({ label: 'Finish', description: 'Floor material' });
    expect(ok.session.history.past).toHaveLength(1);
    expect(currentSchema(undoAttributes(ok.session)).nodes.some((f) => f.key === 'finish')).toBe(false);
    // A refusal in the middle changes nothing.
    const refused = editAttributesBatch(
      ok.session,
      [
        { type: 'update-field', collection: 'nodes', fieldId: 'finish', patch: { label: 'Material' } },
        { type: 'change-field-kind', collection: 'nodes', fieldId: 'finish', kind: 'enum' },
      ],
      'x',
    );
    expect(refused.ok).toBe(false);
    expect(currentSchema(ok.session).nodes.find((f) => f.key === 'finish')!.label).toBe('Finish');
    expect(editAttributesBatch(session, [], 'nothing')).toMatchObject({ ok: true, session });
  });

  it('refuses a type change that would invalidate a value stored in ANY scenario (nothing is converted)', async () => {
    const project = await labToolkit();
    const session = loadAttributeSession(null, project);
    const occupancy = currentSchema(session).nodes.find((f) => f.key === 'occupancy')!;
    const usage = scenarioSamples([
      { id: 'a', name: 'A', doc: docOf({}) },
      { id: 'b', name: 'B', doc: docOf({ occupancy: 12 }) },
    ]);
    const r = editAttributesBatch(session, [{ type: 'change-field-kind', collection: 'nodes', fieldId: occupancy.id, kind: 'boolean' }], 'x', { usage });
    expect(r.ok).toBe(false);
    expect(canUndoAttributes(session)).toBe(false);
  });
});

describe('Attributes panel', () => {
  const render = async (over: Record<string, unknown> = {}) => {
    const project = await labToolkit();
    const session = loadAttributeSession(null, project);
    return renderToStaticMarkup(createElement(AttributesPanel, { session, project, doc: docOf({ daylight: 'high' }), source: 'd.json', onChange: () => {}, onCalculatedFields: () => {}, ...over }));
  };

  it('shows the five sections with Node | Edge, in order, and one Add attribute button', async () => {
    const html = await render({ calculatedFields: ['area', 'degree'] });
    for (const text of ['>Node<', '>Edge<', 'aria-label="Node attributes: Identity"', '>ID<', '>Function<', '>Position<', '>Size<', 'aria-label="Required: cannot be removed"', '>Daylight<', '>Area<', '>Degree<', '+</span> Add attribute']) {
      expect(html, text).toContain(text);
    }
    const sections = [...html.matchAll(/data-attribute-section="([^"]+)"/g)].map((m) => m[1]);
    expect(sections).toEqual(['identity', 'required', 'geometry', 'custom', 'calculated']);
    expect(html.indexOf('>Function<')).toBeLessThan(html.indexOf('>Position<'));
    expect(html.indexOf('>Position<')).toBeLessThan(html.indexOf('>Size<'));
    for (const old of ['>Level<', '>Floors<', '>Position X<']) expect(html).not.toContain(old);
    expect(html.indexOf('>Floors<')).toBeLessThan(html.indexOf('>Daylight<'));
    expect(html.indexOf('>Daylight<')).toBeLessThan(html.indexOf('>Area<'));
    // Each section: a small title and an ⓘ with its summary and a link into the Guide.
    expect(html).toContain('<h4 class="sgl-attr-section-title">Required by the app</h4>');
    expect(html).toContain('data-help-topic="section-geometry"');
    expect(html.split('More in the guide →').length).toBe(6);
    // The sections are not collapsible (only Advanced below them is); no internal ids, no permanent large forms.
    expect(html.slice(0, html.indexOf('data-section="attributes-advanced"'))).not.toContain('sgl-csection-toggle');
    for (const old of ['System fields', 'Custom attributes', 'Add a node field', 'Undo field change', '<code>daylight</code>', 'Kind']) expect(html, old).not.toContain(old);
    expect(html.split('Add attribute').length).toBe(2);
    // Small icon undo/redo for attribute changes only.
    expect(html).toContain('aria-label="No attribute change to undo"');
  });

  it('edges: Identity (ID, Source, Target) and Relationship; no Geometry section', async () => {
    const html = await render({ collection: 'edges', calculatedFields: [] });
    const sections = [...html.matchAll(/data-attribute-section="([^"]+)"/g)].map((m) => m[1]);
    expect(sections).toEqual(['identity', 'required']);
    for (const text of ['>ID<', '>Source<', '>Target<', '>Relationship<']) expect(html, text).toContain(text);
  });

  it('toolkit attributes are tagged and cannot be deleted; yours are tagged and can; calculated rows are only removed from the list', async () => {
    const project = await labToolkit();
    const base = loadAttributeSession(null, project);
    const added = editAttributesBatch(base, [{ type: 'add-field', collection: 'nodes', field: { key: 'finish', label: 'Finish', kind: 'text' } }], 'Add');
    if (!added.ok) throw new Error(added.reason);
    const html = await render({ session: added.session, calculatedFields: ['area'] });
    expect(html).toContain('<span class="sgl-source-tag">Toolkit: Lab</span>');
    expect(html).toContain('<span class="sgl-source-tag">Yours</span>');
    expect(html).not.toContain('aria-label="Delete attribute Daylight…"');
    expect(html).toMatch(/sgl-attr-delete-blocked" title="Comes from the toolkit “Lab”, so it cannot be deleted/);
    expect(html).toContain('aria-label="Delete attribute Finish…"');
    expect(html).toContain('aria-label="Remove Area from the list"');
    expect(html).toContain('Remove from the list (the calculation stays available)');
    expect(html).toContain('aria-label="Calculated: cannot be typed in"');
    expect(html).not.toContain('aria-label="Delete attribute Function');
    expect(html).toContain('aria-label="Required: cannot be removed"');
  });

  it('the edit dialog of a toolkit attribute disables Delete and says why', () => {
    const field = schema.nodes[0]!;
    const html = renderToStaticMarkup(
      createElement(EditAttributeDialog, {
        collection: 'nodes',
        schema,
        field,
        samples: [],
        functions: [],
        references: [],
        apply: () => null,
        onDelete: () => {},
        deleteBlocked: 'Comes from the toolkit “Lab”, so it cannot be deleted.',
        onClose: () => {},
      }),
    );
    expect(html).toMatch(/<button type="button" class="sgl-danger" disabled=""[^>]*>Delete…<\/button>/);
    expect(html).toContain('Comes from the toolkit “Lab”, so it cannot be deleted.');
  });

  it('the Function row opens the Functions pop-up when the host offers it', async () => {
    const html = await render({ onManageFunctions: () => {} });
    expect(html).toContain('aria-label="Add or remove functions"');
  });

  it('without a project explains that attributes belong to a project', () => {
    const html = renderToStaticMarkup(createElement(AttributesPanel, { session: null, project: null, doc: null, source: null, onChange: () => {} }));
    expect(html).toContain('Open a project to see its attributes');
  });
});

describe('attribute dialogs', () => {
  const noop = () => null;

  it('Add attribute asks Custom or Calculated first', () => {
    const html = renderToStaticMarkup(createElement(AddAttributeDialog, { collection: 'nodes', schema, samples: [], enabledMetrics: [], apply: noop, onAddCalculated: () => {}, onClose: () => {} }));
    expect(html).toContain('Add attribute');
    expect(html).toContain('Custom attribute');
    expect(html).toContain('Calculated attribute');
  });

  it('Edit shows name, type, default and options; the identifier only under Advanced', () => {
    const daylight = schemaOf({ type: 'add-field', collection: 'nodes', field: { key: 'daylight', label: 'Daylight', kind: 'enum', values: ['high', 'low'], default: 'high' } }).nodes[0]!;
    const html = renderToStaticMarkup(
      createElement(EditAttributeDialog, { collection: 'nodes', schema, field: daylight, samples: [], functions: [{ id: 'gallery', label: 'Gallery' }], references: [], apply: noop, onDelete: () => {}, onClose: () => {} }),
    );
    for (const text of ['Edit attribute', '>Name<', '>Type<', '>Options<', 'value="high, low"', 'Default', 'Default per function', '<summary>Advanced</summary>', 'Identifier']) expect(html, text).toContain(text);
    expect(html.indexOf('Identifier')).toBeGreaterThan(html.indexOf('<summary>Advanced</summary>'));
  });

  it('Delete explains what happens to entered values across scenarios and how to undo it', () => {
    const capacity = schema.nodes[0]!;
    const samples = scenarioSamples([{ id: 's', name: 'A', doc: docOf({ capacity: 3 }) }]);
    const html = renderToStaticMarkup(createElement(DeleteAttributeDialog, { collection: 'nodes', field: capacity, samples, hasTypeDefaults: false, references: [], apply: noop, onClose: () => {} }));
    expect(html).toContain('Delete attribute “Capacity”?');
    expect(html).toContain('every node in every scenario');
    expect(html).toContain('1 value in 1 scenario');
    expect(html).toContain('Undo');
  });

  it('a calculated attribute shows its definition and explains that removing only hides it', () => {
    const area = METRIC_CATALOGUE.find((m) => m.id === 'area')!;
    const html = renderToStaticMarkup(createElement(AttributeInfoDialog, { name: 'Area', typeText: 'Number · m²', text: area.definition, calculated: area, onRemove: () => {}, onClose: () => {} }));
    expect(html).toContain('Calculated · Number · m²');
    expect(html).toContain('stays available to algorithms');
    expect(html).toContain('Remove from list');
  });
});

describe('custom attributes in Properties', () => {
  const render = (collection: 'nodes' | 'edges', item: object) =>
    renderToStaticMarkup(createElement(CustomAttributes, { collection, item: item as never, schema, run: () => true, onError: () => {}, onManage: () => {} }));

  it('lists every project attribute with its effective source; legacy values separately; no identifiers', () => {
    const html = render('nodes', { id: 7, function: 'gallery', custom: { capacity: 4, legacy: 'kept' } });
    expect(html).toContain('Capacity');
    expect(html).toContain('set here');
    expect(html).toContain('gallery default');
    expect(html).toContain('Use default');
    expect(html).toContain('Not in the project attributes (1)');
    expect(html).toContain('Manage attributes');
    expect(html).not.toContain('<code>capacity</code>');
  });

  it('edges show the edge attributes only, and an invalid stored value is flagged but kept', () => {
    const html = render('edges', { id: 5, custom: { weight: 'heavy' } });
    expect(html).toContain('Weight');
    expect(html).not.toContain('Capacity');
    expect(html).toContain('invalid stored value');
    expect(html).toContain('is kept until you change it');
  });
});

describe('functions (node types) added or removed in the project', () => {
  it('lists toolkit functions, then project functions, with usage across scenarios', () => {
    const rows = functionRows([{ id: 'gallery', label: 'Gallery' }], [{ id: 'kiosk', label: 'Kiosk' }, { id: 'gallery', label: 'Shadow' }], ['gallery', 'gallery', 'kiosk']);
    expect(rows).toEqual([
      { id: 'gallery', label: 'Gallery', fromToolkit: true, used: 2 },
      { id: 'kiosk', label: 'Kiosk', fromToolkit: false, used: 1 },
    ]);
    expect(functionNameProblem('gallery', rows)).toMatch(/already a function/);
    expect(functionNameProblem('Kiosk', rows, 'kiosk')).toBeNull();
    expect(generateFunctionId('Reading room', ['reading-room'])).toBe('reading-room-2');
    expect(generateFunctionId('2 Café', [])).toBe('f-2-cafe');
  });

  it('merges project functions into the active project as valid types; toolkit definitions win; removed toolkit functions are left out', async () => {
    const project = await labToolkit();
    const merged = withProjectFunctions(project, [{ id: 'kiosk', label: 'Kiosk' }, { id: 'gallery', label: 'Not this' }], ['studio']);
    const ids = merged.functions.map((t) => t.id);
    expect(ids).toContain('kiosk');
    expect(ids).not.toContain('studio');
    expect(merged.functions.filter((t) => t.id === 'gallery')).toHaveLength(1);
    expect(merged.functions.find((t) => t.id === 'gallery')!.definition.label).not.toBe('Not this');
    expect(merged.functions.find((t) => t.id === 'kiosk')).toMatchObject({ file: PROJECT_FUNCTIONS_FILE, status: { ok: true } });
    expect(project.functions.map((t) => t.id)).toContain('studio'); // input unchanged
    expect(withProjectFunctions(project, undefined, [])).toBe(project);
  });

  it('round-trips settings.functions and hiddenFunctions in the project file; older files stay byte-identical', () => {
    const plain = serializeProjectFile(fileOf());
    expect(plain).not.toContain('functions');
    const withFunctions = { ...fileOf(), settings: { ...fileOf().settings, functions: [{ id: 'kiosk', label: 'Kiosk' }], hiddenFunctions: ['studio'] } };
    const read = readProjectFile(serializeProjectFile(withFunctions));
    expect(read.ok && read.value.settings.functions).toEqual([{ id: 'kiosk', label: 'Kiosk' }]);
    expect(read.ok && read.value.settings.hiddenFunctions).toEqual(['studio']);
    const bad = readProjectFile(JSON.stringify({ ...JSON.parse(plain), settings: { ...JSON.parse(plain).settings, functions: [{ id: 'Bad Id', label: 'x' }] } }));
    expect(bad.ok).toBe(false);
  });

  it('the Functions pop-up adds, renames and removes; a used function cannot be removed', () => {
    const html = renderToStaticMarkup(
      createElement(FunctionsDialog, {
        toolkitTypes: [{ id: 'gallery', label: 'Gallery' }, { id: 'studio', label: 'Studio' }],
        projectFunctions: [{ id: 'kiosk', label: 'Kiosk' }],
        hidden: ['studio'],
        usedTypeIds: ['gallery'],
        onChange: () => {},
        onClose: () => {},
      }),
    );
    for (const text of ['>Functions<', 'New function name', '>Add<', '>Gallery<', '>Kiosk<', '1 node', 'Restore Studio', 'aria-label="Rename Kiosk"']) expect(html, text).toContain(text);
    expect(html).toMatch(/disabled="" aria-label="Remove Gallery"/);
    expect(html).not.toMatch(/disabled="" aria-label="Remove Kiosk"/);
    expect(html).not.toContain('aria-label="Rename Gallery"');
  });
});
