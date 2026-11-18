import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildBuildingV2, exampleFacadeProvider } from '@app/building';
import { expectOk } from '@app/document/test-fixtures';
import { functionLooks, nodeLooks, validateDocumentV2, type DesignDocumentV2 } from '@app/document/v2';
import { applyDesignCommand, proposeSpatialEdit, resolveRelationships, type DesignCommand, type DesignPort } from '@app/spatial';
import { RoomHighlightContext, SetRoomHighlightContext } from '@app/views/roomHighlight';
import { DesignerPanel } from './DesignerPanel';
import {
  addCardEdit,
  bandName,
  designerCards,
  functionTarget,
  removeCardEdit,
  resetTypeEdit,
  setFacadeModeEdit,
  setRoofEdit,
  setWindowFractionEdit,
  type CardTarget,
  type DesignerEdit,
} from './designerModel';

/** Designer S2 (owner 2026-11-18): Default card, function cards, "+ Style another function", highlight. */

function lab(settings: unknown = undefined): DesignDocumentV2 {
  return expectOk(
    validateDocumentV2({
      schemaVersion: 2,
      metadata: { name: 'cards' },
      nodes: [
        { id: 'g1', grid: [0, 0, 0], typeId: 'gallery' },
        { id: 'g2', grid: [1, 0, 0], typeId: 'gallery' },
        { id: 's1', grid: [0, 2, 0], typeId: 'studio' },
        { id: 'k1', grid: [6, 6, 0], typeId: 'kiosk' },
      ],
      edges: [],
      settings,
    }),
  );
}

const apply = (doc: DesignDocumentV2, edit: DesignerEdit): DesignDocumentV2 => {
  if (edit.kind !== 'command') throw new Error(`expected a command, got ${JSON.stringify(edit)}`);
  return expectOk(applyDesignCommand(doc, edit.command));
};
const DEFAULT: CardTarget = { by: 'function', group: { kind: 'default' }, name: 'Default' };
const facade = exampleFacadeProvider;

describe('designerCards', () => {
  it('a new design has only Default, with every room; every function is offered with its room count', () => {
    const cards = designerCards(lab(), null, facade);
    expect(cards.by).toBe('function');
    expect(cards.defaultCard).toMatchObject({ key: 'default', name: 'Default', removable: false, hasOverride: false });
    expect(cards.defaultCard.nodeIds).toEqual(['g1', 'g2', 's1', 'k1']);
    expect(cards.cards).toEqual([]);
    expect(cards.addable.map((a) => [a.value, a.nodeCount])).toEqual([
      ['gallery', 2],
      ['kiosk', 1],
      ['studio', 1],
    ]);
  });

  it('adding a card moves that function’s rooms out of Default; it is removable and leaves the menu', () => {
    const doc = apply(lab(), addCardEdit(lab(), 'function', 'gallery', 'Gallery'));
    expect(functionLooks(doc.settings)).toEqual({ gallery: {} });
    const cards = designerCards(doc, null, facade);
    expect(cards.cards.map((c) => [c.key, c.nodeIds])).toEqual([['v:gallery', ['g1', 'g2']]]);
    expect(cards.cards[0]).toMatchObject({ removable: true, hasOverride: true, typeId: 'gallery' });
    expect(cards.defaultCard.nodeIds).toEqual(['s1', 'k1']);
    expect(cards.addable.map((a) => a.value)).toEqual(['kiosk', 'studio']);
    // Adding it again changes nothing; removing it brings the rooms back to Default.
    expect(addCardEdit(doc, 'function', 'gallery').kind).toBe('unchanged');
    const removed = apply(doc, removeCardEdit(doc, functionTarget('gallery')));
    expect(removed.settings.styles).toEqual({});
    expect(removeCardEdit(removed, functionTarget('gallery')).kind).toBe('unchanged');
  });

  it('Default styles every room without a card; a card overrides only what it sets', () => {
    let doc = apply(lab(), setWindowFractionEdit(lab(), DEFAULT, 0.1, 0.25));
    doc = apply(doc, setRoofEdit(doc, DEFAULT, 'pergola'));
    doc = apply(doc, setWindowFractionEdit(doc, functionTarget('gallery'), 0.8, facade('gallery').windowFraction));
    const looks = nodeLooks(doc, facade);
    expect(looks.get('g1')!.look).toMatchObject({ windowFraction: 0.8, roof: 'pergola' }); // roof from Default
    expect(looks.get('s1')!.look).toMatchObject({ windowFraction: 0.1, roof: 'pergola' });
    const cards = designerCards(doc, null, facade);
    expect(cards.cards[0]!.inheritedWindowText).toBe('Default, 10 %');
    expect(cards.defaultCard.hasOverride).toBe(true);
    // Reset Default empties it; the gallery card keeps its own value.
    const reset = apply(doc, resetTypeEdit(doc, DEFAULT));
    expect(reset.settings.styles.function?.default).toBeUndefined();
    expect(nodeLooks(reset, facade).get('g1')!.look.windowFraction).toBe(0.8);
  });

  it('a card can be Automatic under an Open or imported Default (stores only the difference)', () => {
    const module = { assetId: 'facade-0123456789abcdef', placement: 'repeat' as const };
    let doc = apply(lab(), setFacadeModeEdit(lab(), DEFAULT, 'import', module, 'Brick'));
    doc = apply(doc, addCardEdit(doc, 'function', 'gallery'));
    expect(nodeLooks(doc, facade).get('g1')!.look.facade).toEqual(module); // inherited from Default
    doc = apply(doc, setFacadeModeEdit(doc, functionTarget('gallery'), 'automatic'));
    expect(functionLooks(doc.settings).gallery).toEqual({ facade: 'none' });
    expect(nodeLooks(doc, facade).get('g1')!.look.facade).toBeNull();
    expect(nodeLooks(doc, facade).get('s1')!.look.facade).toEqual(module);
    // Open Default: Automatic stores walls 'enclosed'.
    let open = apply(lab(), setFacadeModeEdit(lab(), DEFAULT, 'open'));
    open = apply(open, setFacadeModeEdit(open, functionTarget('studio'), 'automatic'));
    expect(functionLooks(open.settings).studio).toEqual({ walls: 'enclosed' });
    expect(nodeLooks(open, facade).get('s1')!.look.walls).toBe('enclosed');
    expect(nodeLooks(open, facade).get('g1')!.look.walls).toBe('open');
    // Open rooms keep only slim posts under the roof and no windows; the enclosed studio has glazing.
    const building = buildBuildingV2(open);
    const glazing = (id: string) => building.elements.filter((e) => e.ownerNodeId === id && e.part === 'glazing').length;
    expect(glazing('s1')).toBeGreaterThan(0);
    expect(glazing('g1')).toBe(0);
  });

  it('names number bands in plain words', () => {
    expect(bandName([50, 100], 0)).toBe('Under 50');
    expect(bandName([50, 100], 1)).toBe('50 – 100');
    expect(bandName([50, 100], 2)).toBe('100 or more');
    expect(bandName([], 0)).toBe('All values');
  });
});

describe('Designer panel: Style rooms by, Default, + Style another function, highlight', () => {
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
  const withSettings = { styleBy: 'function', styles: { function: { groups: [{ value: 'gallery', look: { roof: 'none' } }] } } };

  it('shows the selector, Default first, the function cards, and the add menu', () => {
    const html = renderToStaticMarkup(createElement(DesignerPanel, { design: port(lab(withSettings)) }));
    expect(html).toMatch(/<select id="sgl-designer-style-by">.*<option value="function" selected="">Function<\/option><\/select>/s);
    expect(html.indexOf('id="sgl-designer--default-name"')).toBeLessThan(html.indexOf('id="sgl-designer-gallery-name"'));
    expect(html).toMatch(/Default<\/span>.*2 rooms/s); // studio + kiosk
    expect(html).toMatch(/<option value="" selected="">\+ Style another function…<\/option>/);
    expect(html).not.toMatch(/<option value="gallery">/); // already has a card
  });

  it('a highlight button per card when a view can show it; pressed for the lit card; disabled for an empty card', () => {
    const doc = lab({ styleBy: 'function', styles: { function: { groups: [{ value: 'gallery', look: {} }, { value: 'library', look: {} }] } } });
    const html = renderToStaticMarkup(
      createElement(
        SetRoomHighlightContext.Provider,
        { value: () => {} },
        createElement(
          RoomHighlightContext.Provider,
          { value: { key: 'designer:v:gallery', nodeIds: new Set(['g1', 'g2']) } },
          createElement(DesignerPanel, { design: port(doc) }),
        ),
      ),
    );
    const buttons = html.match(/<button[^>]*class="sgl-designer-highlight"[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(3); // Default, gallery, library
    expect(buttons.find((b) => b.includes('rooms of Gallery') || b.includes('rooms of gallery'))).toContain('aria-pressed="true"');
    expect(buttons.find((b) => b.includes('rooms of Default'))).toContain('aria-pressed="false"');
    expect(buttons.find((b) => b.includes('rooms of library'))).toContain('disabled=""');
  });
});
