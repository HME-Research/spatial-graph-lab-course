import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { historyShortcut } from '@app/session/shortcuts';
import { CONCEPT_IDS, CONCEPTS, conceptOf, ConceptContent, handleDialogKeyDown, InfoButton, type DialogFocusScope } from './concepts';
import { PROPERTIES_DESCRIPTION, PROPERTIES_LABEL } from './labels';
import { nextTabIndex, trappedFocusIndex } from './navigation';
import { CollapsibleSection, readSectionOpen, sectionStorageKey, toggleSection, writeSectionOpen } from './Section';
import { PropertiesIcon, SidebarNav } from './SidebarNav';
import { HorizontalTabs, tabKeyTarget } from './Tabs';

describe('collapsible sections', () => {
  it('is a disclosure whose heading button controls the body; collapsed unless asked or remembered', () => {
    const html = renderToStaticMarkup(createElement(CollapsibleSection, { title: 'Geometry', sectionId: 'g', children: createElement('p', null, 'body') }));
    const controls = /aria-controls="([^"]+)"/.exec(html)?.[1];
    expect(controls).toBeTruthy();
    expect(html).toContain(`id="${controls}"`);
    expect(html).toMatch(/<h3 class="sgl-csection-title"><button[^>]*aria-expanded="false"/);
    expect(html).toContain('data-section="g"');
    const open = renderToStaticMarkup(createElement(CollapsibleSection, { title: 'Geometry', defaultOpen: true, children: createElement('p', null, 'body') }));
    expect(open).not.toMatch(/sgl-csection-body" hidden/);
  });

  it('remembers the user’s open/closed choice per section id (and survives refused storage)', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    expect(readSectionOpen('g', false, storage)).toBe(false);
    writeSectionOpen('g', true, storage);
    expect(data.get(sectionStorageKey('g'))).toBe('1');
    expect(readSectionOpen('g', false, storage)).toBe(true);
    writeSectionOpen('g', false, storage);
    expect(readSectionOpen('g', true, storage)).toBe(false);
    expect(readSectionOpen(undefined, true, storage)).toBe(true);
    const refusing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(readSectionOpen('g', false, refusing)).toBe(false);
    expect(() => writeSectionOpen('g', true, refusing)).not.toThrow();
  });

  it('keeps a collapsed body mounted but hidden, and nests with a level-4 heading', () => {
    const html = renderToStaticMarkup(
      createElement(CollapsibleSection, { title: 'Advanced', defaultOpen: false, level: 4, variant: 'advanced', children: createElement('p', null, 'kept') }),
    );
    expect(html).toMatch(/<h4 class="sgl-csection-title"><button[^>]*aria-expanded="false"/);
    expect(html).toMatch(/class="sgl-csection-body" hidden=""><p>kept<\/p>/);
    expect(html).toContain('sgl-csection-advanced');
  });

  it('puts actions outside the toggle button (no nested interactive content)', () => {
    const html = renderToStaticMarkup(
      createElement(CollapsibleSection, { title: 'Attributes', actions: createElement('button', { type: 'button' }, 'Manage attributes'), children: null }),
    );
    const toggle = /<button type="button" class="sgl-csection-toggle"[\s\S]*?<\/button>/.exec(html)?.[0] ?? '';
    expect(toggle).not.toContain('Manage attributes');
    expect(html).toContain('<div class="sgl-csection-actions"><button type="button">Manage attributes</button></div>');
  });
});

describe('horizontal tabs (Attributes: Node | Edge)', () => {
  it('moves with ArrowLeft/ArrowRight and ignores Up/Down', () => {
    const none = [false, false];
    expect(nextTabIndex('ArrowRight', 0, none, 'horizontal')).toBe(1);
    expect(nextTabIndex('ArrowRight', 1, none, 'horizontal')).toBe(0);
    expect(nextTabIndex('ArrowLeft', 0, none, 'horizontal')).toBe(1);
    expect(nextTabIndex('ArrowDown', 0, none, 'horizontal')).toBeNull();
    expect(nextTabIndex('Home', 1, none, 'horizontal')).toBe(0);
  });

  it('renders a horizontal tab list with the active tab selected and focusable', () => {
    const html = renderToStaticMarkup(
      createElement(
        HorizontalTabs<'nodes' | 'edges'>,
        { label: 'Attributes of', active: 'edges', onActive: () => {}, tabs: [{ id: 'nodes', label: 'Node' }, { id: 'edges', label: 'Edge' }], children: createElement('p', null, 'edge list') },
      ),
    );
    expect(html).toContain('role="tablist" aria-orientation="horizontal" aria-label="Attributes of"');
    expect(html).toMatch(/aria-selected="false"[^>]*tabindex="-1"[^>]*>Node</);
    expect(html).toMatch(/aria-selected="true"[^>]*tabindex="0"[^>]*>Edge</);
    expect(html).toMatch(/role="tabpanel"[^>]*aria-labelledby="[^"]*-tab-edges"/);
  });
});

describe('concept dialogs (`i`)', () => {
  it('covers exactly the four agreed concepts, each short with two contrasting parts', () => {
    expect([...CONCEPT_IDS].sort()).toEqual(['access-open', 'calculated-values', 'project-scenario', 'repeat-stretch']);
    for (const id of CONCEPT_IDS) {
      const c = CONCEPTS[id];
      const sentences = [c.lead, ...c.parts.map((p) => p.text)];
      for (const s of sentences) expect(s.length, `${id}: ${s}`).toBeLessThanOrEqual(160);
      expect(c.parts).toHaveLength(2);
      expect(c.diagramLabel.length).toBeGreaterThan(20);
    }
    expect(conceptOf('nope')).toBeUndefined();
    expect(conceptOf('access-open')?.title).toBe('Access and Open');
  });

  it('renders a labelled title, a lead and an accessible inline SVG diagram', () => {
    for (const id of CONCEPT_IDS) {
      const html = renderToStaticMarkup(createElement(ConceptContent, { concept: CONCEPTS[id], titleId: 't', descriptionId: 'd' }));
      expect(html).toContain(`<h2 id="t" class="sgl-concept-title">${CONCEPTS[id].title}</h2>`);
      expect(html).toContain('<p id="d" class="sgl-concept-lead">');
      expect(html).toMatch(new RegExp(`<svg class="sgl-dg" viewBox="0 0 300 120" role="img" aria-label="[^"]+" data-diagram="${id}">`));
      expect(html).not.toMatch(/<img|https?:/);
    }
  });

  it('the `i` button names its concept, announces a dialog and renders no dialog until pressed', () => {
    const html = renderToStaticMarkup(createElement(InfoButton, { concept: 'repeat-stretch' }));
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-label="About Repeat and Stretch"');
    expect(html).toContain('title="About Repeat and Stretch"');
    expect(html).not.toContain('<dialog');
  });

  it('traps focus: Tab and Shift+Tab wrap inside the dialog', () => {
    expect(trappedFocusIndex(0, 3, false)).toBe(1);
    expect(trappedFocusIndex(2, 3, false)).toBe(0);
    expect(trappedFocusIndex(0, 3, true)).toBe(2);
    expect(trappedFocusIndex(-1, 3, false)).toBe(0);
    expect(trappedFocusIndex(-1, 3, true)).toBe(2);
    expect(trappedFocusIndex(0, 1, false)).toBe(0);
    expect(trappedFocusIndex(0, 0, false)).toBeNull();
  });
});

describe('Properties panel without a redundant tab', () => {
  const single = (collapsed: boolean) =>
    renderToStaticMarkup(
      createElement(SidebarNav, {
        side: 'right',
        label: 'Properties',
        active: 'properties',
        onActive: () => {},
        collapsed,
        onCollapsedChange: () => {},
        tabs: [{ id: 'properties', label: PROPERTIES_LABEL, description: PROPERTIES_DESCRIPTION, icon: createElement(PropertiesIcon), content: createElement('p', null, 'props') }],
      }),
    );

  it('open: a titled panel with one collapse button, no tab list', () => {
    const html = single(false);
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('role="tab"');
    expect(html).toContain('<h2 id="sidebar-heading-properties" class="sgl-sidenav-heading">Properties</h2>');
    expect(html).toContain('aria-label="Hide Properties"');
    expect(html).toContain('title="Hide Properties to give the views more room"');
    expect(html).not.toContain('id="sidebar-tab-properties"');
    expect(html).toContain('<p>props</p>');
  });

  it('collapsed: one labelled button reopens it; the content stays mounted', () => {
    const html = single(true);
    expect(html).toMatch(/<button type="button" id="sidebar-tab-properties"[^>]*aria-expanded="false"[^>]*aria-label="Show Properties"/);
    expect(html).toContain('<span class="sgl-sidenav-label">Properties</span>');
    expect(html).toMatch(/class="sgl-sidenav-panels" hidden=""/);
    expect(html).toContain('<p>props</p>');
  });
});

// ── Behaviour (audit repairs) ─────────────────────────────────────────────────────────────────
// The vitest environment is `node` with no DOM library (adding jsdom would be a new dependency),
// so interaction is tested through the pure handlers the components call, driven by small fakes
// that follow DOM event semantics. The real browser flow (Escape, Tab trap, focus return, no
// undo while the dialog is open) is additionally scripted in the CDP browser check.

/** A keydown on the dialog that bubbles to a window listener unless propagation is stopped. */
function dispatchThroughDialog(init: { key: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }, scope: () => DialogFocusScope, onClose: () => void) {
  const log = { stopped: false, prevented: false, windowSaw: null as string | null };
  const event = {
    key: init.key,
    shiftKey: init.shiftKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    altKey: false,
    isComposing: false,
    get defaultPrevented() {
      return log.prevented;
    },
    preventDefault: () => void (log.prevented = true),
    stopPropagation: () => void (log.stopped = true),
  };
  handleDialogKeyDown(event, scope, onClose); // target phase: the <dialog> element
  if (!log.stopped) log.windowSaw = historyShortcut(event, null); // App's window listener
  return log;
}

const focusables = (n: number, active: number) => {
  const focused: number[] = [];
  const scope = (): DialogFocusScope => ({ focusable: Array.from({ length: n }, (_, i) => ({ focus: () => void focused.push(i) })), activeIndex: active });
  return { scope, focused };
};

describe('concept dialog keyboard behaviour', () => {
  it('Escape closes the dialog and does not reach the page', () => {
    let closed = 0;
    const { scope } = focusables(1, 0);
    const log = dispatchThroughDialog({ key: 'Escape' }, scope, () => void closed++);
    expect(closed).toBe(1);
    expect(log).toMatchObject({ stopped: true, prevented: true, windowSaw: null });
  });

  it('Tab and Shift+Tab wrap inside the dialog', () => {
    const last = focusables(3, 2);
    dispatchThroughDialog({ key: 'Tab' }, last.scope, () => {});
    expect(last.focused).toEqual([0]);
    const first = focusables(3, 0);
    expect(dispatchThroughDialog({ key: 'Tab', shiftKey: true }, first.scope, () => {}).prevented).toBe(true);
    expect(first.focused).toEqual([2]);
    const outside = focusables(2, -1);
    dispatchThroughDialog({ key: 'Tab' }, outside.scope, () => {});
    expect(outside.focused).toEqual([0]);
  });

  it('keeps Ctrl+Z, Ctrl+Y and Cmd+Shift+Z away from the window undo listener while open', () => {
    let closed = 0;
    for (const init of [{ key: 'z', ctrlKey: true }, { key: 'y', ctrlKey: true }, { key: 'Z', metaKey: true, shiftKey: true }]) {
      const log = dispatchThroughDialog(init, focusables(1, 0).scope, () => void closed++);
      expect(log.stopped, init.key).toBe(true);
      expect(log.windowSaw, init.key).toBeNull();
    }
    expect(closed).toBe(0);
    // Control: the same event without the dialog would undo.
    expect(historyShortcut({ key: 'z', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, isComposing: false, defaultPrevented: false }, null)).toBe('undo');
  });

  it('other keys (Enter on Close) are not prevented, so the button still activates', () => {
    const log = dispatchThroughDialog({ key: 'Enter' }, focusables(1, 0).scope, () => {});
    expect(log).toMatchObject({ stopped: true, prevented: false });
  });
});

describe('section toggle and tab keys', () => {
  it('a toggle press opens a collapsed section and collapses an open one', () => {
    expect(toggleSection(true)).toBe(false);
    expect(toggleSection(toggleSection(true))).toBe(true);
    const closed = renderToStaticMarkup(createElement(CollapsibleSection, { title: 'S', defaultOpen: toggleSection(true), children: 'x' }));
    expect(closed).toMatch(/aria-expanded="false"[\s\S]*hidden=""/);
  });

  it('ArrowLeft/ArrowRight/Home/End activate and focus the target tab; other keys do nothing', () => {
    const ids = ['nodes', 'edges'] as const;
    expect(tabKeyTarget('ArrowRight', 0, ids)).toEqual({ id: 'edges', index: 1 });
    expect(tabKeyTarget('ArrowRight', 1, ids)).toEqual({ id: 'nodes', index: 0 });
    expect(tabKeyTarget('ArrowLeft', 0, ids)).toEqual({ id: 'edges', index: 1 });
    expect(tabKeyTarget('End', 0, ids)).toEqual({ id: 'edges', index: 1 });
    expect(tabKeyTarget('Home', 1, ids)).toEqual({ id: 'nodes', index: 0 });
    for (const key of ['ArrowDown', 'ArrowUp', 'Tab', 'Enter', 'a']) expect(tabKeyTarget(key, 0, ids)).toBeNull();
    expect(tabKeyTarget('ArrowRight', 0, [])).toBeNull();
  });
});
