import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { groupAlgorithms, KNOWN_ALGORITHMS, presentAlgorithm, type AlgorithmPresentationInput } from './algorithmGroups';
import { CONCEPT_IDS, CONCEPTS, conceptOf, ConceptContent, InfoButton } from './concepts';
import { PROPERTIES_DESCRIPTION, PROPERTIES_LABEL } from './labels';
import { nextTabIndex, trappedFocusIndex } from './navigation';
import { CollapsibleSection } from './Section';
import { PropertiesIcon, SidebarNav } from './SidebarNav';
import { HorizontalTabs } from './Tabs';

describe('collapsible sections', () => {
  it('is a disclosure whose heading button controls the body', () => {
    const html = renderToStaticMarkup(createElement(CollapsibleSection, { title: 'Geometry', sectionId: 'g', children: createElement('p', null, 'body') }));
    const controls = /aria-controls="([^"]+)"/.exec(html)?.[1];
    expect(controls).toBeTruthy();
    expect(html).toContain(`id="${controls}"`);
    expect(html).toMatch(/<h3 class="sgl-csection-title"><button[^>]*aria-expanded="true"/);
    expect(html).toContain('data-section="g"');
    expect(html).not.toMatch(/sgl-csection-body" hidden/);
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

describe('Algorithms grouping (Explore / Analyse / Generate)', () => {
  const entry = (id: string, scope: AlgorithmPresentationInput['scope'], enabled = true): AlgorithmPresentationInput => ({ id, scope, enabled });

  it('a transformation is always Generate and modifying, whatever the table says', () => {
    expect(presentAlgorithm(entry('access-depth', 'spatial'))).toMatchObject({ group: 'generate', effect: 'modifies', term: 'Spatial transformation' });
    expect(presentAlgorithm(entry('anything', 'spatial'))).toMatchObject({ group: 'generate', effect: 'modifies' });
  });

  it('a graph analysis is read-only: Explore when listed so, otherwise Analyse', () => {
    expect(presentAlgorithm(entry('access-depth', 'graph'))).toEqual({ group: 'explore', effect: 'read-only', term: KNOWN_ALGORITHMS['access-depth']!.term });
    expect(presentAlgorithm(entry('count-connections', 'graph'))).toMatchObject({ group: 'analyse', term: 'Node degree' });
    expect(presentAlgorithm(entry('student-thing', 'graph'))).toEqual({ group: 'analyse', effect: 'read-only', term: 'Graph analysis' });
    // A table entry meant for a transformation never gives a graph analysis a "Generate" place.
    expect(presentAlgorithm(entry('connect-neighbours', 'graph'))).toMatchObject({ group: 'analyse', term: 'Graph analysis' });
  });

  it('disabled or unknown definitions are marked unavailable; inherited keys are ignored', () => {
    expect(presentAlgorithm(entry('access-depth', 'graph', false)).effect).toBe('unavailable');
    expect(presentAlgorithm(entry('x', 'unknown')).effect).toBe('unavailable');
    expect(presentAlgorithm(entry('toString', 'graph')).term).toBe('Graph analysis');
  });

  it('groups in Explore → Analyse → Generate order, omits empty groups and keeps list indices', () => {
    const list = [entry('connect-neighbours', 'spatial'), entry('count-connections', 'graph'), entry('access-depth', 'graph')];
    const groups = groupAlgorithms(list);
    expect(groups.map((g) => g.group)).toEqual(['explore', 'analyse', 'generate']);
    expect(groups.map((g) => g.items.map((i) => i.index))).toEqual([[2], [1], [0]]);
    expect(groupAlgorithms([entry('a', 'graph')]).map((g) => g.group)).toEqual(['analyse']);
  });
});
