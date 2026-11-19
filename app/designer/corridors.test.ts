import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { validateDocumentV2, type DesignDocumentV2 } from '@app/document';
import { expectOk } from '@app/document/test-fixtures';
import { applyDesignCommand, type DesignCommand } from '@app/spatial';
import { applyDesignCommandToSession, currentDocument, openDocument, redoDocument, undoDocument } from '@app/session/documentSession';
import { undoLabel } from '@app/session/history';
import { Inspector } from '@app/inspector/Inspector';
import { corridorRaw, fakePort } from '@app/inspector/test-fixtures';
import { selectEdge } from '@core/viewer/selection';
import { DesignerPanel } from './DesignerPanel';
import { corridorsSummary, resetCorridorsEdit, setCorridorRoofEdit, setCorridorStyleEdit, type DesignerEdit } from './designerModel';

/** Building Designer → Corridors (2026-11-19): model, one command per edit, undo, panel and Properties. */

const base = (): DesignDocumentV2 => expectOk(validateDocumentV2(corridorRaw()));
const withCorridors = (corridors: object, own?: string): DesignDocumentV2 => {
  const raw = corridorRaw();
  return expectOk(
    validateDocumentV2({
      ...raw,
      edges: raw.edges.map((e) => (own ? { ...e, connectorStyle: own } : e)),
      settings: { ...raw.settings, corridors },
    }),
  );
};
function commandOf(edit: DesignerEdit): DesignCommand {
  if (edit.kind !== 'command') throw new Error(`expected a command, got ${JSON.stringify(edit)}`);
  return edit.command;
}

describe('corridor designer model', () => {
  it('summarises the built-in defaults', () => {
    expect(corridorsSummary(base())).toEqual({ style: 'covered', styleSetHere: false, roof: 'flat', roofSetHere: false, roofApplies: true, overrideCount: 0 });
    expect(corridorsSummary(withCorridors({ style: 'deck' }, 'enclosed'))).toMatchObject({ style: 'deck', styleSetHere: true, roofApplies: false, overrideCount: 1 });
  });

  it('each choice is one set-corridors command; choosing the effective value or an unknown one sends nothing', () => {
    const doc = base();
    expect(commandOf(setCorridorStyleEdit(doc, 'enclosed'))).toEqual({ type: 'set-corridors', patch: { style: 'enclosed' } });
    expect(commandOf(setCorridorRoofEdit(doc, 'pergola'))).toEqual({ type: 'set-corridors', patch: { roof: 'pergola' } });
    expect(setCorridorStyleEdit(doc, 'covered')).toEqual({ kind: 'unchanged' });
    expect(setCorridorRoofEdit(doc, 'flat')).toEqual({ kind: 'unchanged' });
    expect(setCorridorStyleEdit(doc, 'tunnel').kind).toBe('invalid');
    expect(setCorridorRoofEdit(doc, 'pitched').kind).toBe('invalid');
    expect(resetCorridorsEdit(doc)).toEqual({ kind: 'unchanged' });
  });

  it('the command keeps the other field, and clearing both removes `corridors`', () => {
    let doc = expectOk(applyDesignCommand(base(), commandOf(setCorridorStyleEdit(base(), 'enclosed'))));
    doc = expectOk(applyDesignCommand(doc, commandOf(setCorridorRoofEdit(doc, 'none'))));
    expect(doc.settings.corridors).toEqual({ style: 'enclosed', roof: 'none' });
    doc = expectOk(applyDesignCommand(doc, { type: 'set-corridors', patch: { style: null } }));
    expect(doc.settings.corridors).toEqual({ roof: 'none' });
    doc = expectOk(applyDesignCommand(doc, commandOf(resetCorridorsEdit(doc))));
    expect('corridors' in doc.settings).toBe(false);
  });

  it('refuses invalid values from untyped callers (runtime validation)', () => {
    const r = applyDesignCommand(base(), { type: 'set-corridors', patch: { roof: 'pitched' } } as unknown as DesignCommand);
    expect(r.ok).toBe(false);
  });

  it('one committed change is one labelled, undoable step', () => {
    let s = openDocument(base(), 'test', null);
    const before = currentDocument(s);
    const r = applyDesignCommandToSession(s, commandOf(setCorridorRoofEdit(before, 'pergola')));
    if (!r.ok) throw new Error('expected ok');
    s = r.session;
    expect(s.history.past).toHaveLength(1);
    expect(undoLabel(s.history)).toBe('Change the corridor roof');
    expect(currentDocument(s).settings.corridors).toEqual({ roof: 'pergola' });
    s = undoDocument(s);
    expect(currentDocument(s)).toBe(before);
    s = redoDocument(s);
    expect(currentDocument(s).settings.corridors).toEqual({ roof: 'pergola' });
  });
});

describe('Corridors section in the Building Designer', () => {
  it('shows Style and Roof with their source, a plain hint, the Properties note and a reset', () => {
    const html = renderToStaticMarkup(createElement(DesignerPanel, { design: fakePort() }));
    expect(html).toContain('data-section="designer-corridors"');
    expect(html).toContain('>Corridors</span>');
    expect(html).toContain('Corridors are built automatically between related rooms that do not touch.');
    expect(html).toMatch(/<select id="sgl-designer-corridor-style"[^>]*>.*<option value="covered" [^>]*selected=""[^>]*>Covered<\/option>/);
    expect(html).toMatch(/<select id="sgl-designer-corridor-roof"[^>]*>.*<option value="flat" selected="">Flat<\/option><option value="pergola">Pergola \(open slats\)<\/option><option value="none">None \(open top\)<\/option>/);
    const section = html.slice(html.indexOf('data-section="designer-corridors"'));
    expect(section.split('>Built-in default</span>').length - 1).toBe(2);
    expect(html).toContain('One relationship can still have its own style in Properties');
    expect(html).toMatch(/<button type="button" class="sgl-designer-reset" disabled="">Reset corridors<\/button>/);
  });

  it('marks values set here, explains covered + none, and disables the roof for a deck', () => {
    const none = renderToStaticMarkup(createElement(DesignerPanel, { design: fakePort(withCorridors({ roof: 'none' })) }));
    expect(none).toContain('>Set here</span>');
    expect(none).toContain('Covered with no roof has no posts either, so it looks like a Deck.');
    expect(none).toMatch(/<button type="button" class="sgl-designer-reset">Reset corridors<\/button>/);
    const deck = renderToStaticMarkup(createElement(DesignerPanel, { design: fakePort(withCorridors({ style: 'deck' })) }));
    expect(deck).toMatch(/<select id="sgl-designer-corridor-roof" disabled=""/);
    expect(deck).toContain('A Deck has no roof');
  });
});

describe('Properties: corridor style of one relationship', () => {
  const render = (doc: DesignDocumentV2) =>
    renderToStaticMarkup(createElement(Inspector, { onSelect: () => {}, design: fakePort(doc), selection: selectEdge(1) }));

  it('shows the inherited design style as "Design default (…)" and selects it while the relationship sets none', () => {
    const html = render(withCorridors({ style: 'enclosed' }));
    expect(html).toMatch(/<option value=""[^>]*selected=""[^>]*>Design default \(Enclosed\)<\/option>/);
    expect(html).toContain('Change it for the whole design in Building Designer → Corridors.');
    const own = render(withCorridors({ style: 'enclosed' }, 'deck'));
    expect(own).toMatch(/<option value="deck" [^>]*selected=""[^>]*>Deck<\/option>/);
    expect(own).toContain('Set for this relationship only.');
  });
});
