import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { validateDocumentV2, type CorridorLook, type DesignDocumentV2 } from '@app/document';
import { expectOk } from '@app/document/test-fixtures';
import { applyDesignCommand, type DesignCommand } from '@app/spatial';
import { applyDesignCommandToSession, currentDocument, openDocument, redoDocument, undoDocument } from '@app/session/documentSession';
import { undoLabel } from '@app/session/history';
import { Inspector } from '@app/inspector/Inspector';
import { corridorRaw, fakePort } from '@app/inspector/test-fixtures';
import { selectEdge } from '@core/viewer/selection';
import { DesignerPanel } from './DesignerPanel';
import { corridorCard, resetCorridorsEdit, setCorridorRoofEdit, setCorridorWallsEdit, setCorridorWidthEdit, type DesignerEdit } from './designerModel';

/** The Corridors look card (owner 2026-11-19): model, one command per edit, undo, Designer card and Properties. */

const base = (): DesignDocumentV2 => expectOk(validateDocumentV2(corridorRaw()));
const withCorridors = (corridors: CorridorLook, own?: CorridorLook, settings: object = {}): DesignDocumentV2 => {
  const raw = corridorRaw();
  return expectOk(
    validateDocumentV2({
      ...raw,
      edges: raw.edges.map((e) => (own ? { ...e, corridor: own } : e)),
      settings: { ...raw.settings, ...settings, corridors },
    }),
  );
};
function commandOf(edit: DesignerEdit): DesignCommand {
  if (edit.kind !== 'command') throw new Error(`expected a command, got ${JSON.stringify(edit)}`);
  return edit.command;
}

describe('corridor card model', () => {
  it('summarises the built-in defaults (Open + Flat) and what the card sets', () => {
    expect(corridorCard(base())).toEqual({
      effective: { walls: 'open', roof: 'flat', width: 1.5 },
      setHere: { walls: false, roof: false, width: false },
      hasOverride: false,
      overrideCount: 0,
      corridorCount: null,
    });
    expect(corridorCard(withCorridors({ walls: 'enclosed' }, { roof: 'none' }))).toMatchObject({
      effective: { walls: 'enclosed', roof: 'flat', width: 1.5 },
      setHere: { walls: true, roof: false, width: false },
      hasOverride: true,
      overrideCount: 1,
    });
  });

  it('each choice is one set-corridors command; choosing the effective value or an unknown one sends nothing', () => {
    const doc = base();
    expect(commandOf(setCorridorWallsEdit(doc, 'enclosed'))).toEqual({ type: 'set-corridors', patch: { walls: 'enclosed' } });
    expect(commandOf(setCorridorRoofEdit(doc, 'pergola'))).toEqual({ type: 'set-corridors', patch: { roof: 'pergola' } });
    expect(setCorridorWallsEdit(doc, 'open')).toEqual({ kind: 'unchanged' });
    expect(setCorridorRoofEdit(doc, 'flat')).toEqual({ kind: 'unchanged' });
    expect(setCorridorWallsEdit(doc, 'glass').kind).toBe('invalid');
    expect(setCorridorRoofEdit(doc, 'pitched').kind).toBe('invalid');
    expect(resetCorridorsEdit(doc)).toEqual({ kind: 'unchanged' });
    // A stored value equal to the built-in default is still "set here": choosing it again sends nothing.
    expect(setCorridorWallsEdit(withCorridors({ walls: 'open' }), 'open')).toEqual({ kind: 'unchanged' });
  });

  it('the command keeps the other field, and clearing both removes `corridors`', () => {
    let doc = expectOk(applyDesignCommand(base(), commandOf(setCorridorWallsEdit(base(), 'enclosed'))));
    doc = expectOk(applyDesignCommand(doc, commandOf(setCorridorRoofEdit(doc, 'none'))));
    expect(doc.settings.corridors).toEqual({ walls: 'enclosed', roof: 'none' });
    doc = expectOk(applyDesignCommand(doc, { type: 'set-corridors', patch: { walls: null } }));
    expect(doc.settings.corridors).toEqual({ roof: 'none' });
    doc = expectOk(applyDesignCommand(doc, commandOf(resetCorridorsEdit(doc))));
    expect('corridors' in doc.settings).toBe(false);
  });

  it('width: typed metres → one set-corridors command; the effective value sends nothing; empty clears; out of range is refused', () => {
    const doc = base();
    expect(commandOf(setCorridorWidthEdit(doc, '2'))).toEqual({ type: 'set-corridors', patch: { width: 2 } });
    expect(commandOf(setCorridorWidthEdit(doc, '1,2 m'))).toEqual({ type: 'set-corridors', patch: { width: 1.2 } });
    expect(setCorridorWidthEdit(doc, '1.5')).toEqual({ kind: 'unchanged' });
    expect(setCorridorWidthEdit(doc, '')).toEqual({ kind: 'unchanged' });
    for (const bad of ['0', '-1', '3.1', 'wide']) expect(setCorridorWidthEdit(doc, bad).kind).toBe('invalid');
    expect(setCorridorWidthEdit(doc, '3').kind).toBe('command');
    const set = withCorridors({ width: 2 });
    expect(commandOf(setCorridorWidthEdit(set, ''))).toEqual({ type: 'set-corridors', patch: { width: null } });
    expect(setCorridorWidthEdit(set, '2')).toEqual({ kind: 'unchanged' });
    expect(commandOf(resetCorridorsEdit(set))).toEqual({ type: 'set-corridors', patch: { walls: null, roof: null, width: null } });
    // The command keeps the other fields (key order walls, roof, width).
    const both = expectOk(applyDesignCommand(withCorridors({ roof: 'none' }), { type: 'set-corridors', patch: { width: 2.5 } }));
    expect(both.settings.corridors).toEqual({ roof: 'none', width: 2.5 });
    expect(Object.keys(both.settings.corridors!)).toEqual(['roof', 'width']);
  });

  it('width edits are one labelled, undoable step each (card and relationship)', () => {
    let s = openDocument(base(), 'test', null);
    const before = currentDocument(s);
    const r = applyDesignCommandToSession(s, commandOf(setCorridorWidthEdit(before, '2.4')));
    if (!r.ok) throw new Error('expected ok');
    s = r.session;
    expect(s.history.past).toHaveLength(1);
    expect(undoLabel(s.history)).toBe('Set the corridor width to 2.4 m');
    expect(currentDocument(s).settings.corridors).toEqual({ width: 2.4 });
    s = undoDocument(s);
    expect(currentDocument(s)).toBe(before);
    const own = applyDesignCommandToSession(s, { type: 'set-edge-corridor', edgeId: 1, patch: { width: 0.9 } });
    if (!own.ok) throw new Error('expected ok');
    expect(undoLabel(own.session.history)).toBe('Set the corridor width of edge 1 → 2 to 0.9 m');
    expect(currentDocument(own.session).edges[0]!.corridor).toEqual({ width: 0.9 });
  });

  it('refuses invalid values from untyped callers (runtime validation)', () => {
    expect(applyDesignCommand(base(), { type: 'set-corridors', patch: { width: 0 } }).ok).toBe(false);
    expect(applyDesignCommand(base(), { type: 'set-corridors', patch: { width: 3.5 } }).ok).toBe(false);
    expect(applyDesignCommand(base(), { type: 'set-edge-corridor', edgeId: 1, patch: { width: -1 } }).ok).toBe(false);
    expect(applyDesignCommand(base(), { type: 'set-corridors', patch: { roof: 'pitched' } } as unknown as DesignCommand).ok).toBe(false);
    expect(applyDesignCommand(base(), { type: 'set-corridors', patch: { walls: 'glass' } } as unknown as DesignCommand).ok).toBe(false);
  });

  it('one committed change is one labelled, undoable step', () => {
    let s = openDocument(base(), 'test', null);
    const before = currentDocument(s);
    const r = applyDesignCommandToSession(s, commandOf(setCorridorRoofEdit(before, 'pergola')));
    if (!r.ok) throw new Error('expected ok');
    s = r.session;
    expect(s.history.past).toHaveLength(1);
    expect(undoLabel(s.history)).toBe('Set the corridor roof to Pergola');
    expect(currentDocument(s).settings.corridors).toEqual({ roof: 'pergola' });
    const w = applyDesignCommandToSession(s, commandOf(setCorridorWallsEdit(currentDocument(s), 'enclosed')));
    if (!w.ok) throw new Error('expected ok');
    s = w.session;
    expect(undoLabel(s.history)).toBe('Set the corridor walls to Enclosed');
    const reset = applyDesignCommandToSession(s, commandOf(resetCorridorsEdit(currentDocument(s))));
    if (!reset.ok) throw new Error('expected ok');
    s = reset.session;
    expect(undoLabel(s.history)).toBe('Reset the Corridors card');
    expect('corridors' in currentDocument(s).settings).toBe(false);
    s = undoDocument(undoDocument(undoDocument(s)));
    expect(currentDocument(s)).toBe(before);
    s = redoDocument(s);
    expect(currentDocument(s).settings.corridors).toEqual({ roof: 'pergola' });
  });
});

describe('Corridors card in its own Corridors section', () => {
  const html = (doc: DesignDocumentV2 = base()) => renderToStaticMarkup(createElement(DesignerPanel, { design: fakePort(doc) }));
  const cardOf = (markup: string) => {
    const start = markup.indexOf('data-card="corridors"');
    expect(start).toBeGreaterThan(-1);
    return markup.slice(start, markup.indexOf('</article>', start));
  };

  it('is one card in its own section after Looks (not a look), built like a room card: Walls, Roof, Width with source tags, preview, reset', () => {
    const markup = html();
    // Its own collapsible section (2026-11-20), after the Looks section; the Looks list does not contain it.
    const looks = markup.indexOf('data-section="designer-functions"');
    const section = markup.indexOf('data-section="designer-corridors"');
    expect(looks).toBeGreaterThan(-1);
    expect(section).toBeGreaterThan(looks);
    expect(markup.slice(looks, section)).not.toContain('data-card="corridors"');
    expect(markup.indexOf('data-card="corridors"')).toBeGreaterThan(section);
    expect(markup.split('data-card="corridors"').length - 1).toBe(1);
    // The Looks count is Default + the function cards only.
    expect(markup.slice(looks, section)).toMatch(/Looks by Function<\/span><span class="[^"]*">1</);
    // Always open inside its section: no toggle of its own, the body is never hidden.
    expect(cardOf(markup)).not.toContain('<button type="button" class="sgl-designer-type-head');
    expect(markup).not.toMatch(/id="sgl-designer-corridors-body"[^>]*hidden/);
    const card = cardOf(markup);
    expect(card).toContain('>Corridors (generated)</span>');
    expect(card).toContain('Open sides · Flat roof');
    expect(card).toContain('Corridors are built automatically between related rooms that don&#x27;t touch.');
    expect(card).toContain('class="sgl-designer-preview"');
    // Walls: the room cards' Enclosed / Open words; Roof: the room cards' roof select.
    expect(card).toMatch(/<input type="radio" name="sgl-designer-corridors-walls" value="enclosed"\/>Enclosed/);
    expect(card).toMatch(/<input type="radio" name="sgl-designer-corridors-walls" checked="" value="open"\/>Open/);
    expect(card).toMatch(
      /<select id="sgl-designer-corridors-roof">.*<option value="flat" selected="">Flat<\/option><option value="pergola">Pergola \(open slats\)<\/option><option value="none">None \(open top\)<\/option>/,
    );
    expect(card.split('>Built-in default</span>').length - 1).toBe(3);
    // Width: a number box in metres (one cell at most), with its own source tag.
    expect(card).toContain('Open sides · Flat roof · 1.5 m');
    expect(card).toMatch(/<label for="sgl-designer-corridors-width"[^>]*>Width<\/label><span class="sgl-designer-source">Built-in default<\/span>/);
    expect(card).toMatch(/<input id="sgl-designer-corridors-width" type="number" inputMode="decimal" min="0.1" max="3" step="0.1" aria-label="Corridor width in metres" value="1.5"\/>/);
    // No windows or imported façade for corridors.
    expect(card).not.toContain('Windows');
    expect(card).not.toContain('Imported façade');
    expect(card).toContain('One edge can set its own walls, roof or width in Properties.');
    expect(card).toMatch(/<button type="button" class="sgl-designer-reset" disabled="">Reset Corridors<\/button>/);
  });

  it('the source tag sits on the label row (it never wraps alone under the select)', () => {
    const card = cardOf(html(withCorridors({ roof: 'pergola' })));
    expect(card).toMatch(
      /<div class="sgl-designer-sourced-head"><label for="sgl-designer-corridors-roof"[^>]*>Style<\/label><span class="sgl-designer-source">Set here<\/span><\/div><select id="sgl-designer-corridors-roof"/,
    );
  });

  it('marks values set here, explains open + none, counts relationship overrides, and enables reset', () => {
    const card = cardOf(html(withCorridors({ roof: 'none' }, { walls: 'enclosed' })));
    expect(card.split('>Set here</span>').length - 1).toBe(1);
    expect(card).toContain('Open sides and no roof: just the floor (no posts).');
    expect(card).toContain('1 edge sets its own walls, roof or width in Properties.');
    const wide = cardOf(html(withCorridors({ width: 2.4 })));
    expect(wide).toContain('Open sides · Flat roof · 2.4 m');
    expect(wide).toMatch(/>Width<\/label><span class="sgl-designer-source">Set here<\/span>/);
    expect(wide).toContain('value="2.4"');
    expect(card).toContain(' · changed');
    expect(card).toMatch(/<button type="button" class="sgl-designer-reset">Reset Corridors<\/button>/);
    const enclosed = cardOf(html(withCorridors({ walls: 'enclosed', roof: 'pergola' })));
    expect(enclosed).toContain('Enclosed · Pergola');
  });

  it.each([
    ['function', {}],
    ['level', { styleBy: 'level' }],
    ['a removed attribute', { styleBy: 'attribute:gone' }],
  ])('is present whatever the rooms are styled by (%s)', (_name, settings) => {
    const markup = html(withCorridors({ walls: 'enclosed' }, undefined, settings));
    expect(cardOf(markup)).toContain('Enclosed · Flat roof');
  });
});

describe('Properties: corridor walls and roof of one relationship', () => {
  const render = (doc: DesignDocumentV2) =>
    renderToStaticMarkup(createElement(Inspector, { onSelect: () => {}, design: fakePort(doc), selection: selectEdge(1) }));

  it('shows the Corridors card values as "Design default (…)" and selects them while the relationship sets none', () => {
    const html = render(withCorridors({ walls: 'enclosed', roof: 'pergola' }));
    expect(html).toMatch(/aria-label="Corridor walls"[^>]*>.*?<option value=""[^>]*selected=""[^>]*>Design default \(Enclosed\)<\/option>/);
    expect(html).toMatch(/aria-label="Corridor roof"[^>]*>.*?<option value=""[^>]*selected=""[^>]*>Design default \(Pergola \(open slats\)\)<\/option>/);
    expect(html).toContain('Change every corridor with the Corridors card in Building Designer → Corridors.');
    const builtIn = render(base());
    expect(builtIn).toContain('Design default (Open)');
    expect(builtIn).toContain('Design default (Flat)');
  });

  it('selects the relationship’s own value per field', () => {
    const html = render(withCorridors({ walls: 'enclosed' }, { roof: 'none' }));
    expect(html).toMatch(/aria-label="Corridor walls"[^>]*>.*?<option value=""[^>]*selected=""/);
    expect(html).toMatch(/<option value="none" [^>]*selected=""[^>]*>None \(open top\)<\/option>/);
    expect(html).toContain('This corridor: 1.5 m wide, side walls and no roof.');
    expect(html).toContain('One is set for this edge only');
  });

  it('width: a number box whose empty state is "Design default (<card width>)"; its own value shows with ↺', () => {
    const html = render(withCorridors({ width: 2 }));
    expect(html).toMatch(/<input id="sgl-edge-1-corridor-width" type="number"[^>]*aria-label="Corridor width" placeholder="Design default \(2 m\)"[^>]*value=""\/>/);
    expect(render(base())).toContain('placeholder="Design default (1.5 m)"');
    const own = render(withCorridors({}, { width: 0.9 }));
    expect(own).toMatch(/aria-label="Corridor width"[^>]*value="0.9"/);
    expect(own).toContain('aria-label="Use the design default width"');
    expect(own).toContain('This corridor: 0.9 m wide,');
  });

  it('each choice sends one set-edge-corridor command; "Design default" clears the field', () => {
    let s = openDocument(withCorridors({}, { walls: 'enclosed' }), 'test', null);
    const r = applyDesignCommandToSession(s, { type: 'set-edge-corridor', edgeId: 1, patch: { walls: null } });
    if (!r.ok) throw new Error('expected ok');
    s = r.session;
    expect(undoLabel(s.history)).toBe("Use the design's corridor walls for edge 1 → 2");
    expect('corridor' in currentDocument(s).edges[0]!).toBe(false);
    s = undoDocument(s);
    expect(currentDocument(s).edges[0]!.corridor).toEqual({ walls: 'enclosed' });
  });
});
