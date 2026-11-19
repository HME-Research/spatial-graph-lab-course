import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { handleDialogKeyDown } from '../concepts/dialogKeys';
import { GUIDE_TAB_IDS, GUIDE_TAB_LABELS, type Explainer } from '../guideContracts';
import { AboutButton, AboutContent, appVersion } from '../about';
import { GuideButton } from './GuideButton';
import { GUIDE_CONTENT, guideTabContent, tabsWithoutContent } from './content';
import { ExplainerView, ExplainerWindow } from './ExplainerView';
import { GuideWindow } from './GuideWindow';

/** package.json read from disk (Node 22 built-in; the app tree may not import files outside app/). */
const pkg = JSON.parse(
  (globalThis as unknown as { process: { getBuiltinModule(id: string): { readFileSync(u: URL, enc: string): string } } }).process
    .getBuiltinModule('node:fs')
    .readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
) as { version: string };

const sample: Explainer = {
  id: 'demo',
  title: 'Demo title',
  summary: 'One sentence.',
  example: 'A Kitchen next to a Hall.',
  diagram: 'demo-diagram',
  learnMore: { label: 'Read more', url: 'https://example.org/x' },
};

describe('About', () => {
  it('shows the package.json version, developer and description, with no link', () => {
    expect(appVersion()).toBe(pkg.version);
    const html = renderToStaticMarkup(createElement(AboutContent));
    expect(html).toContain(`Version ${pkg.version}`);
    expect(html).toContain('Developed by Heba Eiz');
    expect(html).toContain('graphs of rooms and relationships become architecture');
    expect(html).not.toContain('<a ');
  });
  it('has an accessibly named button', () => {
    const html = renderToStaticMarkup(createElement(AboutButton));
    expect(html).toContain('aria-label="About Spatial Graph Lab"');
    expect(html).toContain('<button');
  });
  it('Escape closes a dialog (handler shared with Dialog)', () => {
    let closed = 0;
    handleDialogKeyDown({ key: 'Escape', shiftKey: false, preventDefault: () => undefined, stopPropagation: () => undefined }, () => ({ focusable: [], activeIndex: -1 }), () => closed++);
    expect(closed).toBe(1);
  });
});

describe('Guide', () => {
  it('has content for every tab and a labelled button', () => {
    expect(tabsWithoutContent()).toEqual([]);
    expect(GUIDE_CONTENT.map((c) => c.tab)).toEqual([...GUIDE_TAB_IDS]);
    expect(renderToStaticMarkup(createElement(GuideButton))).toContain('Guide');
  });
  it('renders all tabs and the first tab content in a labelled window', () => {
    const html = renderToStaticMarkup(createElement(GuideWindow, { open: true, onClose: () => undefined, link: null }));
    for (const id of GUIDE_TAB_IDS) expect(html).toContain(GUIDE_TAB_LABELS[id].replace('&', '&amp;'));
    expect(html).toContain(guideTabContent('graphs')!.blocks[0]!.summary);
    expect(html).toContain('aria-label="Close Guide"');
    expect(renderToStaticMarkup(createElement(GuideWindow, { open: false, onClose: () => undefined, link: null }))).toBe('');
  });
  it('opens at the tab named by a GuideLink', () => {
    const html = renderToStaticMarkup(createElement(GuideWindow, { open: true, onClose: () => undefined, link: { tab: 'views' } }));
    expect(html).toContain(guideTabContent('views')!.blocks[0]!.summary);
    expect(html).not.toContain(guideTabContent('graphs')!.blocks[0]!.summary);
  });
});

describe('Explainer rendering', () => {
  it('renders summary before example, a diagram slot and a safe Learn more link', () => {
    const html = renderToStaticMarkup(createElement(ExplainerView, { explainer: sample, renderDiagram: (d) => createElement('svg', { 'data-d': d }) }));
    expect(html.indexOf('One sentence.')).toBeLessThan(html.indexOf('A Kitchen next to a Hall.'));
    expect(html).toContain('data-diagram="demo-diagram"');
    expect(html).toContain('data-d="demo-diagram"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
  it('omits diagram and link when absent', () => {
    const html = renderToStaticMarkup(createElement(ExplainerView, { explainer: { id: 'a', title: 'T', summary: 'S', example: 'E' } }));
    expect(html).not.toContain('data-diagram');
    expect(html).not.toContain('<a ');
  });
  it('ExplainerWindow shows one explainer in a window', () => {
    const html = renderToStaticMarkup(createElement(ExplainerWindow, { explainer: sample, open: true, onClose: () => undefined }));
    expect(html).toContain('Demo title');
    expect(html).toContain('One sentence.');
    expect(html).toContain('data-floating="explainer-demo"');
  });
});
