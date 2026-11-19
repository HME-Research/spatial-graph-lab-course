import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildBuildingV2, exampleFacadeProvider } from '@app/building';
import { expectOk } from '@app/document/test-fixtures';
import { nodeLooks, validateDocumentV2, type DesignDocumentV2 } from '@app/document/v2';
import type { AttributeField, ProjectAttributeSchema } from '@app/extensions';
import { applyDesignCommand, proposeSpatialEdit, resolveRelationships, type DesignCommand, type DesignPort } from '@app/spatial';
import { buildProjectViewContext } from '@app/views/project';
import { styleValuesFor } from '@app/views/styleValues';
import { DesignerPanel } from './DesignerPanel';
import {
  addCardEdit,
  bandDividersEdit,
  bandName,
  designerCards,
  styleAttributeName,
  styleAttributeOf,
  styleAttributes,
  styleByEdit,
  styleModeEdit,
  valueName,
  bandStep,
  wholeNumbers,
  withAddedDivider,
  type DesignerEdit,
} from './designerModel';

/** Designer S3 (owner 2026-11-18/19): style rooms by any node attribute; number bands. */

const field = (f: Partial<AttributeField> & Pick<AttributeField, 'id' | 'kind'>): AttributeField => ({ key: f.id, label: f.id, ...f });
const SCHEMA: ProjectAttributeSchema = {
  nodes: [
    field({ id: 'comfort', label: 'Comfort', kind: 'enum', values: ['Quiet', 'Lively', 'Busy'] }),
    field({ id: 'zone', label: 'Zone', kind: 'text' }),
    field({ id: 'public', label: 'Public', kind: 'boolean', default: false }),
    field({ id: 'seats', label: 'Seats', kind: 'number' }),
  ],
  edges: [],
  nodeTypeDefaults: { kiosk: { comfort: 'Busy' } },
};

/** Four rooms: areas 9, 18, 36 and 72 m² (1, 2, 4 and 8 cells); two storeys. */
function lab(settings: unknown = undefined): DesignDocumentV2 {
  return expectOk(
    validateDocumentV2({
      schemaVersion: 2,
      metadata: { name: 'style-by' },
      nodes: [
        { id: 'g1', grid: [0, 0, 0], size: [1, 1, 1], typeId: 'gallery', attributes: { comfort: 'Quiet', zone: 'North ', public: true, seats: 10 } },
        { id: 'g2', grid: [4, 0, 0], size: [2, 1, 1], typeId: 'gallery', attributes: { comfort: 'Lively', zone: 'north', seats: 10 } },
        { id: 's1', grid: [0, 4, 1], size: [2, 2, 1], typeId: 'studio', attributes: { comfort: 'Nope', zone: 'South', seats: 25 } },
        { id: 'k1', grid: [8, 8, 0], size: [4, 2, 1], typeId: 'kiosk', attributes: {} },
      ],
      edges: [],
      settings,
    }),
  );
}
const facade = exampleFacadeProvider;
const apply = (doc: DesignDocumentV2, edit: DesignerEdit): DesignDocumentV2 => {
  if (edit.kind !== 'command') throw new Error(`expected a command, got ${JSON.stringify(edit)}`);
  return expectOk(applyDesignCommand(doc, edit.command));
};
const valuesOf = (doc: DesignDocumentV2, by = doc.settings.styleBy) => styleValuesFor(doc, resolveRelationships(doc), by, SCHEMA);
const SHOWN = ['area', 'volume', 'degree'];
const cardsOf = (doc: DesignDocumentV2) => designerCards(doc, null, facade, valuesOf(doc), styleAttributeOf(doc.settings.styleBy, SCHEMA, SHOWN));

describe('styleValuesFor: the rooms’ values of a custom attribute or a measured value', () => {
  it('custom attributes resolve like Properties: instance, type default, schema default; invalid values fall back', () => {
    const d = lab();
    expect([...valuesOf(d, 'attribute:comfort')!]).toEqual([['g1', 'Quiet'], ['g2', 'Lively'], ['k1', 'Busy']]); // s1 'Nope' is not an option
    expect(valuesOf(d, 'attribute:public')!.get('g2')).toBe(false); // schema default
    expect(valuesOf(d, 'attribute:missing')!.size).toBe(0); // removed field: every room uses Default
  });
  it('measured values come from the catalogue metric; unknown metrics give nothing; Function / Level need none', () => {
    const d = lab();
    expect([...valuesOf(d, 'metric:area')!]).toEqual([['g1', 9], ['g2', 18], ['s1', 36], ['k1', 72]]);
    expect(valuesOf(d, 'metric:nope')!.size).toBe(0);
    expect(valuesOf(d, 'function')).toBeUndefined();
    expect(valuesOf(d, 'level')).toBeUndefined();
  });
});

describe('the "Style rooms by" selector', () => {
  it('Room, Your attributes (by label) and the measured values shown in Attributes', () => {
    const list = styleAttributes(SCHEMA, SHOWN, 'function');
    expect(list.map((a) => [a.group, a.by, styleAttributeName(a), a.kind])).toEqual([
      ['room', 'function', 'Function', 'function'],
      ['room', 'level', 'Level', 'number'],
      ['attributes', 'attribute:comfort', 'Comfort', 'choice'],
      ['attributes', 'attribute:zone', 'Zone', 'text'],
      ['attributes', 'attribute:public', 'Public', 'yesno'],
      ['attributes', 'attribute:seats', 'Seats', 'number'],
      ['measured', 'metric:area', 'Area (m²)', 'number'],
      ['measured', 'metric:volume', 'Volume (m³)', 'number'],
      ['measured', 'metric:degree', 'Degree', 'number'],
    ]);
  });
  it('the attribute in use stays listed: a measured value hidden from Attributes, or a removed attribute', () => {
    const hidden = styleAttributes(SCHEMA, ['area'], 'metric:has-exterior-facade').at(-1)!;
    expect([hidden.status, hidden.kind, styleAttributeName(hidden)]).toEqual(['hidden', 'yesno', 'Has exterior façade (not in Attributes)']);
    const removed = styleAttributes(SCHEMA, SHOWN, 'attribute:gone').at(-1)!;
    expect([removed.status, removed.label]).toEqual(['removed', 'Removed attribute']);
  });
});

describe('cards per kind of attribute', () => {
  it('Choice: "+ Style another option" lists the options in field order with room counts; a removed option warns', () => {
    let d = apply(lab(), styleByEdit(lab(), styleAttributeOf('attribute:comfort', SCHEMA)));
    expect(cardsOf(d).addable.map((a) => [a.value, a.nodeCount])).toEqual([['Quiet', 1], ['Lively', 1], ['Busy', 1]]);
    expect(cardsOf(d).missingCount).toBe(1); // s1
    d = apply(d, addCardEdit(d, 'attribute:comfort', 'Busy'));
    d = apply(d, addCardEdit(d, 'attribute:comfort', 'Gone'));
    const cards = cardsOf(d);
    expect(cards.cards.map((c) => [c.name, c.nodeIds, c.warning !== null])).toEqual([['Busy', ['k1'], false], ['Gone', [], true]]);
    expect(cards.cards[1]!.warning).toMatch(/no longer an option of Comfort/);
  });

  it('Yes/No: Yes and No cards, named in words', () => {
    const d = apply(lab(), styleByEdit(lab(), styleAttributeOf('attribute:public', SCHEMA)));
    expect(cardsOf(d).addable.map((a) => [a.label, a.nodeCount])).toEqual([['Yes', 1], ['No', 3]]);
    const yes = apply(d, addCardEdit(d, 'attribute:public', true, 'Yes'));
    expect(cardsOf(yes).cards.map((c) => [c.name, c.nodeIds])).toEqual([['Yes', ['g1']]]);
  });

  it('Text: typed values, trimmed and case-insensitive; suggestions are the values rooms have now, with counts', () => {
    const d = apply(lab(), styleByEdit(lab(), styleAttributeOf('attribute:zone', SCHEMA)));
    expect(cardsOf(d).addable.map((a) => [a.value, a.nodeCount])).toEqual([['North', 2], ['South', 1]]);
    expect(addCardEdit(d, 'attribute:zone', '   ')).toEqual({ kind: 'invalid', message: 'Type a value first.' });
    const north = apply(d, addCardEdit(d, 'attribute:zone', '  NORTH '));
    expect(north.settings.styles['attribute:zone']!.groups).toEqual([{ value: 'NORTH', look: {} }]);
    expect(cardsOf(north).cards[0]!.nodeIds).toEqual(['g1', 'g2']);
    expect(addCardEdit(north, 'attribute:zone', 'north').kind).toBe('unchanged');
  });

  it('Level: one card per storey by default ("+ Style another level"), named "Level 1"', () => {
    const d = apply(lab(), styleByEdit(lab(), styleAttributeOf('level')));
    expect(d.settings.styles).toEqual({});
    const cards = cardsOf(d);
    expect(cards.mode).toBe('values');
    expect(cards.addable.map((a) => [a.label, a.nodeCount])).toEqual([['Level 0', 3], ['Level 1', 1]]);
    const one = apply(d, addCardEdit(d, 'level', 1, 'Level 1'));
    expect(cardsOf(one).cards.map((c) => [c.name, c.nodeIds])).toEqual([['Level 1', ['s1']]]);
  });

  it('a measured number starts with suggested bands in ONE step, named with the unit; counts follow', () => {
    const area = styleAttributeOf('metric:area', SCHEMA, SHOWN);
    const edit = styleByEdit(lab(), area, valuesOf(lab(), 'metric:area'));
    expect(edit).toMatchObject({ kind: 'command', command: { type: 'set-style-by', by: 'metric:area', dividers: [20, 40] } });
    const d = apply(lab(), edit);
    const cards = cardsOf(d);
    expect(cards.mode).toBe('bands');
    expect(cards.dividers).toEqual([20, 40]);
    expect(cards.cards.map((c) => [c.name, c.nodeIds])).toEqual([
      ['Under 20 m²', ['g1', 'g2']],
      ['20 – 40 m²', ['s1']],
      ['40 m² or more', ['k1']],
    ]);
    expect(cards.numbers).toEqual([9, 18, 36, 72]);
    // Switching away and back restores the bands (no new suggestion).
    const away = apply(d, styleByEdit(d, styleAttributeOf('function')));
    const back = apply(away, styleByEdit(away, area, valuesOf(away, 'metric:area')));
    expect(back.settings.styleBy).toBe('metric:area');
    expect(back.settings.styles['metric:area']).toEqual(d.settings.styles['metric:area']);
  });

  it('a number can switch to one card per value and back; bands for Level start at whole storeys', () => {
    const level = styleAttributeOf('level');
    let d = apply(lab(), styleByEdit(lab(), level));
    d = apply(d, styleModeEdit(d, level, 'bands'));
    expect(d.settings.styles.level).toEqual({ dividers: [1], bands: [{}, {}] });
    expect(cardsOf(d).cards.map((c) => c.name)).toEqual(['Up to level 0', 'Level 1 and above']);
    expect(styleModeEdit(d, level, 'bands').kind).toBe('unchanged');
    d = apply(d, styleModeEdit(d, level, 'values'));
    expect(cardsOf(d).mode).toBe('values');
    expect(cardsOf(d).cards).toEqual([]);
  });

  it('a removed attribute: every room in Default, the setup kept', () => {
    const d = lab({ styleBy: 'attribute:gone', styles: { 'attribute:gone': { groups: [{ value: 'x', look: { roof: 'none' } }] } } });
    const cards = designerCards(d, null, facade, valuesOf(d), styleAttributeOf('attribute:gone', SCHEMA));
    expect(cards.attribute.status).toBe('removed');
    expect(cards.defaultCard.nodeIds).toEqual(['g1', 'g2', 's1', 'k1']);
    expect(cards.cards.map((c) => c.name)).toEqual(['x']);
  });
});

describe('band names, dividers and value names', () => {
  it('names bands with units, and Level bands as storeys', () => {
    expect(bandName([50, 100], 0, { unit: 'm²' })).toBe('Under 50 m²');
    expect(bandName([50, 100], 1, { unit: 'm²' })).toBe('50 – 100 m²');
    expect(bandName([50, 100], 2, { unit: 'm²' })).toBe('100 m² or more');
    expect(bandName([12.345], 0)).toBe('Under 12.35');
    expect(bandName([1, 3], 0, { level: true })).toBe('Up to level 0');
    expect(bandName([1, 3], 1, { level: true })).toBe('Levels 1–2');
    expect(bandName([1, 2], 1, { level: true })).toBe('Level 1');
    expect(bandName([1, 3], 2, { level: true })).toBe('Level 3 and above');
    expect(valueName({ unit: 'm²' }, 120)).toBe('120 m²');
    expect(valueName({ level: true }, 2)).toBe('Level 2');
  });

  it('dividers must ascend; unchanged dividers send nothing; Level dividers are whole storeys', () => {
    const d = lab({ styleBy: 'metric:area', styles: { 'metric:area': { dividers: [20, 40], bands: [{}, {}, {}] } } });
    const area = styleAttributeOf('metric:area');
    expect(bandDividersEdit(d, area, [40, 20])).toMatchObject({ kind: 'invalid' });
    expect(bandDividersEdit(d, area, [20, 40]).kind).toBe('unchanged');
    expect(bandDividersEdit(d, area, [25, 40])).toMatchObject({ kind: 'command', command: { type: 'set-band-dividers', dividers: [25, 40] } });
    expect(bandDividersEdit(d, styleAttributeOf('level'), [1.4])).toMatchObject({ command: { dividers: [1] } });
  });

  it('"+ Add divider" splits the widest band at a round value; none when Level bands are single storeys', () => {
    expect(withAddedDivider([9, 18, 36, 72], [20, 40])).toEqual([20, 40, 60]);
    expect(withAddedDivider([0, 1], [1], true)).toBeNull();
    expect(withAddedDivider([0, 4], [], true)).toEqual([2]);
    // Every room the same value: a divider can still be added (bands set up ahead).
    expect(withAddedDivider([9, 9, 9], [])).not.toBeNull();
  });

  it('whole-number values (Level, Degree, counts) use whole steps', () => {
    expect(wholeNumbers({ level: true }, [])).toBe(true);
    expect(wholeNumbers({}, [1, 2, 3])).toBe(true);
    expect(wholeNumbers({}, [1, 2.5])).toBe(false);
    expect(wholeNumbers({}, [])).toBe(false);
    expect(bandStep({ min: 0.9, max: 3.1 }, true)).toBe(1);
    expect(bandStep({ min: 0.9, max: 3.1 })).toBe(0.05);
    expect(withAddedDivider([1, 5, 9], [5], true)!.every(Number.isInteger)).toBe(true);
    expect(withAddedDivider([1, 2, 3, 3], [2, 3], true)).toBeNull(); // every whole value has its own band already
    // Degree starts with whole-number bands.
    const degree = styleAttributeOf('metric:degree');
    const d = lab();
    const edit = styleByEdit(d, degree, new Map([['g1', 1], ['g2', 2], ['s1', 2], ['k1', 3]]));
    expect(edit.kind === 'command' && edit.command.type === 'set-style-by' && edit.command.dividers!.every(Number.isInteger)).toBe(true);
  });
});

describe('the Building styles rooms by the chosen attribute', () => {
  const roofOf = (doc: DesignDocumentV2, values: ReturnType<typeof valuesOf>, id: string) => nodeLooks(doc, facade, values).get(id)!.look.roof;

  it('by Area bands: a large room gets its band’s look in the 3D building', () => {
    const d = lab({ styleBy: 'metric:area', styles: { 'metric:area': { dividers: [40], bands: [{}, { roof: 'none' }] } } });
    const values = valuesOf(d);
    expect(roofOf(d, values, 'k1')).toBe('none');
    expect(roofOf(d, values, 'g1')).toBe('flat');
    const building = buildBuildingV2(d, { spatial: resolveRelationships(d), facade, ...(values && { styleValues: values }) });
    expect(building.looks.get('k1')!.look.roof).toBe('none');
    const roofs = (id: string) => building.elements.filter((e) => e.ownerNodeId === id && e.part === 'roof').length;
    expect(roofs('k1')).toBe(0);
    expect(roofs('g1')).toBeGreaterThan(0);
  });

  it('by a Choice attribute: rooms of the same function can look different', () => {
    const d = lab({ styleBy: 'attribute:comfort', styles: { 'attribute:comfort': { groups: [{ value: 'quiet', look: { walls: 'open' } }] } } });
    const looks = nodeLooks(d, facade, valuesOf(d));
    expect(looks.get('g1')!.look.walls).toBe('open');
    expect(looks.get('g2')!.look.walls).toBe('enclosed');
  });
});

describe('Designer panel (S3 render)', () => {
  function port(doc: DesignDocumentV2, sent: DesignCommand[] = []): DesignPort {
    return {
      doc,
      spatial: resolveRelationships(doc),
      onCommand: (command) => {
        sent.push(command);
        const result = applyDesignCommand(doc, command);
        return result.ok ? { ok: true } : { ok: false, issues: result.issues };
      },
      proposeEdit: (request) => proposeSpatialEdit(doc, request),
    };
  }
  const render = (doc: DesignDocumentV2) =>
    renderToStaticMarkup(createElement(DesignerPanel, { design: port(doc), project: buildProjectViewContext(null, doc, facade, SCHEMA) }));

  it('the selector groups Room, Your attributes and Measured', () => {
    const html = render(lab());
    expect(html).toMatch(/<optgroup label="Room">.*<optgroup label="Your attributes"><option value="attribute:comfort">Comfort<\/option>.*<optgroup label="Measured">/s);
  });

  it('Text: a text box with suggestions and "+ Add card"', () => {
    const html = render(lab({ styleBy: 'attribute:zone', styles: {} }));
    expect(html).toMatch(/<input type="text" aria-label="Zone value to style"[^>]*list="sgl-designer-text-values"/);
    expect(html).toMatch(/<datalist id="sgl-designer-text-values"><option value="North">2 rooms<\/option><option value="South">1 room<\/option><\/datalist>/);
    expect(html).toContain('1 room has no Zone value and uses Default.');
  });

  it('Bands: the Cards choice, a track with a handle per divider, a number box each, and "+ Add divider"', () => {
    const html = render(lab({ styleBy: 'metric:area', styles: { 'metric:area': { dividers: [20, 40], bands: [{}, {}, {}] } } }));
    expect(html).toMatch(/name="sgl-designer-style-mode" checked="" value="bands"/);
    const handles = html.match(/role="slider"[^>]*/g) ?? [];
    expect(handles).toHaveLength(2);
    expect(handles[0]).toContain('aria-valuenow="20"');
    expect(handles[0]).toContain('aria-valuetext="20 m²"');
    expect(html).toMatch(/id="sgl-designer-bands-divider-1"[^>]*value="40"/);
    expect(html).toContain('+ Add divider');
    expect(html).toMatch(/Under 20 m²<\/span>/);
    expect(html).not.toContain('Style another value'); // bands have no add menu
  });

  it('Level by value: "+ Style another level" with room counts', () => {
    const html = render(lab({ styleBy: 'level', styles: {} }));
    expect(html).toMatch(/<option value="" selected="">\+ Style another level…<\/option><option value="0">Level 0 · 3 rooms<\/option><option value="1">Level 1 · 1 room<\/option>/);
    expect(html).toMatch(/checked="" value="values"/);
  });

  it('a removed attribute shows a warning and no add control', () => {
    const html = render(lab({ styleBy: 'attribute:gone', styles: {} }));
    expect(html).toContain('This attribute is no longer in Attributes');
    expect(html).toMatch(/<option value="attribute:gone" selected="">Removed attribute<\/option>/);
    expect(html).not.toContain('sgl-designer-add');
  });
});
