import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ANALYSE_VS_TRANSFORM, ANALYSIS_EXPLAINERS, SECTION_EXPLAINERS } from '@app/analysis/explainers';
import { uploadExplainer } from '@app/analysis/uploadExplainer';
import { TRANSFORM_EXPLAINER, transformUploadExplainer } from '@app/session/transformExplainers';
import { GUIDE_TAB_IDS, type Explainer } from '../guideContracts';
import { GUIDE_CONTENT } from './content';
import { GUIDE_DIAGRAM_IDS, renderGuideDiagram } from './diagrams';
import { ExplainerView } from './ExplainerView';
import { GuideWindow } from './GuideWindow';
import { LINKS } from './links';
import { CAPTURED_SHOTS, SHOT_ALT } from './screenshots';

/** Node built-ins without importing outside app/ (the app tree may not import node modules directly). */
const node = globalThis as unknown as {
  process: {
    getBuiltinModule(id: 'node:fs'): {
      readFileSync(p: URL | string, enc: string): string;
      readdirSync(p: URL | string, o: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
      existsSync(p: URL | string): boolean;
    };
  };
};
const fs = node.process.getBuiltinModule('node:fs');
const ROOT = new URL('../../../', import.meta.url);

const guideEntries: Explainer[] = GUIDE_CONTENT.flatMap((t) => [...t.blocks]);
const explainers: Explainer[] = [...SECTION_EXPLAINERS, ...ANALYSIS_EXPLAINERS, ANALYSE_VS_TRANSFORM, uploadExplainer(), TRANSFORM_EXPLAINER, transformUploadExplainer()];
/**
 * Entries without an external "Learn more" link: the upload ⓘ windows offer their kits instead, and
 * the Transform tab's ⓘ and its Guide entry point to the tutorial and the upload ⓘ (owner 2026-11-25:
 * the old general-algorithms link taught nothing about this tab).
 */
const NO_LINK = new Set(['upload-your-own', 'upload-your-own-transform', 'transform-tab', 'panel-transform']);
/** Every diagram id an entry names (its contrasting pair and its single diagram). */
const diagramIds = (e: Explainer): string[] => [...(e.diagrams ?? []).map((c) => c.diagram), ...(e.diagram !== undefined ? [e.diagram] : [])];
/**
 * Entries that keep ONE diagram (a numbered mock or step strip matching their screenshot) and no
 * contrasting pair, because they are step-by-step walkthroughs of the UI with no two values to
 * contrast (owner 2026-11-20: "if a pair is genuinely meaningless, use one diagram").
 */
const SINGLE = new Set([
  'panel-properties',
  'panel-attributes',
  'panel-analyse',
  'panel-camera',
  'panel-project',
  'howto-start',
  'howto-open-example',
  'howto-select-inspect',
  'howto-add-room',
  'howto-add-attribute',
  'howto-run-analysis',
  'howto-query',
  'howto-transform-undo',
  'howto-upload-analysis',
  'howto-upload-transform',
  'transform-tab',
  'howto-read-data-view',
  'howto-save',
]);
const all = [...guideEntries, ...explainers];

function* files(dir: URL): Generator<URL> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const u = new URL(e.name + (e.isDirectory() ? '/' : ''), dir);
    if (e.isDirectory()) yield* files(u);
    else if (/\.(ts|tsx|md|json|mjs|js|css|html)$/.test(e.name)) yield u;
  }
}

describe('Guide content (P4 item H)', () => {
  it('has no Wikipedia link anywhere in app/, docs/, toolkits/ or tutorial/ (owner rule)', () => {
    const hits: string[] = [];
    for (const dir of ['app/', 'docs/', '../toolkits/', '../tutorial/']) {
      for (const f of files(new URL(dir, ROOT))) {
        if (f.pathname.endsWith('/guideContent.test.ts')) continue;
        if (/wikipedia\.org/i.test(fs.readFileSync(f, 'utf8'))) hits.push(f.pathname);
      }
    }
    expect(hits).toEqual([]);
  });

  it('every tab has entries; Panels covers every side panel; Data is a view', () => {
    expect(GUIDE_CONTENT.map((c) => c.tab)).toEqual([...GUIDE_TAB_IDS]);
    for (const t of GUIDE_CONTENT) expect(t.blocks.length, t.tab).toBeGreaterThan(2);
    const panels = GUIDE_CONTENT.find((t) => t.tab === 'panels')!.blocks.map((b) => b.title);
    for (const p of ['Properties', 'Attributes', 'Building Designer', 'Analyse', 'Transform', 'Scenarios', 'Camera', 'Display']) expect(panels).toContain(p);
    expect(GUIDE_CONTENT.find((t) => t.tab === 'views')!.blocks.map((b) => b.id)).toContain('view-data');
  });

  it('keeps the anchors the app links to (attribute sections)', () => {
    const ids = GUIDE_CONTENT.find((t) => t.tab === 'attributes')!.blocks.map((b) => b.id);
    for (const s of ['identity', 'required', 'geometry', 'custom', 'calculated']) expect(ids).toContain(`section-${s}`);
  });

  it('every entry: unique id, known diagrams, one https link from the checked list', () => {
    const ids = guideEntries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const checked = new Set<string>(Object.values(LINKS).map((l) => l.url));
    for (const e of all) {
      expect(diagramIds(e).length, e.id).toBeGreaterThan(0);
      for (const d of diagramIds(e)) expect(GUIDE_DIAGRAM_IDS, `${e.id}: ${d}`).toContain(d);
      if (NO_LINK.has(e.id)) {
        expect(e.learnMore, e.id).toBeUndefined();
        continue;
      }
      expect(e.learnMore, e.id).toBeDefined();
      expect(checked.has(e.learnMore!.url), `${e.id}: ${e.learnMore!.url}`).toBe(true);
    }
    for (const l of Object.values(LINKS)) expect(l.url).toMatch(/^https:\/\//);
  });

  it('uses the current vocabulary and never explains with the built-in example (owner 2026-11-20)', () => {
    const text = JSON.stringify(all.map(({ id, title, summary, example, diagrams }) => ({ id, title, summary, example, diagrams })));
    for (const old of ['typeId', '"grid"', '"kind"', 'nodeTypes', 'defineNodeType', 'types/', 'Hall', 'Landing', 'Studio', 'for the Student API', 'Triadic', 'triadic']) expect(text, old).not.toContain(old);
    expect(text).not.toMatch(/\bthings?\b/i);
    expect(text).not.toMatch(/\bpictures?\b/i);
    // No walkthrough of the built-in example: no "the (example) house", no rooms named the way the
    // house names them ("the Living room", "the Entrance", "Living–Bedroom"…).
    expect(text).not.toMatch(/\b(on|in) the house\b|\bexample house\b/i);
    expect(text).not.toMatch(/\bthe (Entrance|Living room|Kitchen|Bedroom|Bath)\b/);
    expect(text).not.toMatch(/(Entrance|Living|Kitchen|Bedroom|Bath)–(Entrance|Living|Kitchen|Bedroom|Bath)/);
  });

  it('every concept shows two contrasting diagrams with captions; walkthroughs may keep one (owner 2026-11-20)', () => {
    for (const e of all) {
      if (SINGLE.has(e.id)) {
        expect(e.diagrams, e.id).toBeUndefined();
        continue;
      }
      expect(e.diagrams, e.id).toHaveLength(2);
      const [a, b] = e.diagrams!;
      expect(a.diagram, e.id).not.toBe(b.diagram);
      for (const c of e.diagrams!) expect(c.caption.length, `${e.id}: ${c.diagram}`).toBeGreaterThan(4);
    }
    // Every SINGLE id is a real entry, so the list cannot hide a typo.
    for (const id of SINGLE) expect(all.some((e) => e.id === id), id).toBe(true);
  });

  it('draws a contrasting pair side by side, each diagram one labelled image with its caption', () => {
    const shared = ANALYSIS_EXPLAINERS.find((e) => e.id === 'shared-neighbours')!;
    const html = renderToStaticMarkup(createElement(ExplainerView, { explainer: shared }));
    expect(html).toContain('class="sgl-explainer-pair"');
    expect(html).toContain('data-diagram="shared-0"');
    expect(html).toContain('data-diagram="shared-1"');
    expect(html).toContain('<figcaption>0: no node joined to both</figcaption>');
    expect(html.match(/role="img"/g)).toHaveLength(2);
    expect(html.indexOf('shared-0')).toBeLessThan(html.indexOf('shared-1'));
  });

  it('every diagram renders as one labelled image', () => {
    for (const id of GUIDE_DIAGRAM_IDS) {
      const html = renderToStaticMarkup(createElement('div', null, renderGuideDiagram(id)));
      expect(html, id).toMatch(/role="img"|<ol[^>]*aria-label=/);
      expect(html, id).toMatch(/aria-label="[^"]{20,}"/);
    }
    expect(renderGuideDiagram('no-such-diagram')).toBeNull();
  });

  it('the Guide window draws the diagrams by default', () => {
    const html = renderToStaticMarkup(createElement(GuideWindow, { open: true, onClose: () => undefined, link: { tab: 'graphs' } }));
    expect(html).toContain('data-diagram="graph-none"');
    expect(html).toContain('class="sgl-gd"');
  });

  it('screenshots: files exist, markers are fractions numbered 1…n, every shot has alt text', () => {
    for (const [id, shot] of Object.entries(CAPTURED_SHOTS)) {
      expect(guideEntries.some((e) => e.id === id), id).toBe(true);
      expect(SHOT_ALT[id], id).toBeDefined();
      expect(shot.src, id).toMatch(/^\/guide\/[a-z0-9-]+\.(webp|png)$/);
      expect(fs.existsSync(new URL(`public${shot.src}`, ROOT)), shot.src).toBe(true);
      expect(shot.markers.map((m) => m.n), id).toEqual(shot.markers.map((_, i) => i + 1));
      for (const m of shot.markers) {
        expect(m.x, `${id} ${m.n}`).toBeGreaterThanOrEqual(0);
        expect(m.x, `${id} ${m.n}`).toBeLessThanOrEqual(1);
        expect(m.y, `${id} ${m.n}`).toBeGreaterThanOrEqual(0);
        expect(m.y, `${id} ${m.n}`).toBeLessThanOrEqual(1);
      }
      const entry = guideEntries.find((e) => e.id === id)!;
      expect(entry.screenshot?.src, id).toBe(shot.src);
    }
  });

  it('draws a screenshot with its numbered markers over it, positioned by fraction', () => {
    const html = renderToStaticMarkup(
      createElement(ExplainerView, {
        explainer: { id: 's', title: 'T', summary: 'S', example: 'E', screenshot: { src: '/guide/x.webp', alt: 'The app: 1 a button, 2 a panel.', markers: [{ n: 1, x: 0.25, y: 0.5 }, { n: 2, x: 1, y: 0 }] } },
      }),
    );
    expect(html).toContain('<img src="/guide/x.webp" alt="The app: 1 a button, 2 a panel."');
    expect(html).toContain('data-marker="1"');
    expect(html).toContain('left:25.00%;top:50.00%');
    expect(html).toContain('left:100.00%;top:0.00%');
  });

  it('the Transform tab ⓘ teaches the tab: operations, how to use it, where transforms come from, the tutorial; no external link', () => {
    const html = renderToStaticMarkup(createElement(ExplainerView, { explainer: TRANSFORM_EXPLAINER }));
    expect(TRANSFORM_EXPLAINER.learnMore).toBeUndefined();
    expect(html).not.toContain('ocw.mit.edu');
    for (const title of ['What a transform can propose', 'How to use this tab', 'Where transforms come from']) expect(html).toContain(`>${title}</h4>`);
    for (const words of ['Add a node', 'Add an edge', 'Move or resize', 'custom value', 'Apply', 'Discard', 'out of date', 'Upload your own (.ts)']) expect(html).toContain(words);
    expect(html).toContain('href="/tutorial/04-your-own-transform.html"');
    expect(html).toContain('data-diagram="transform-steps"');
  });

  it('Write your own transform shows the transform kit tabs, like the Transform upload ⓘ', () => {
    const entry = guideEntries.find((e) => e.id === 'ask-ai-for-transform')!;
    expect(entry.aiKits).toBe('transform');
    expect(transformUploadExplainer().aiKits).toBe('transform');
    const html = renderToStaticMarkup(createElement(ExplainerView, { explainer: entry }));
    expect(html).toContain('data-ai-kits="transform"');
    expect(html).toContain('data-download="spatial-graph-lab-transform-kit.zip"');
  });

  it('Write your own analysis shows the same AI kit tabs as the Upload ⓘ, with no old prompt files', () => {
    const ai = guideEntries.find((e) => e.id === 'ask-ai-for-analysis')!;
    expect(ai.aiKits).toBe(true);
    expect(ai.downloads).toBeUndefined();
    const html = renderToStaticMarkup(createElement(ExplainerView, { explainer: ai }));
    expect(html).toContain('data-ai-kits=""');
    expect(html).not.toContain('ALGORITHM-PROMPT');
    expect(html).not.toContain('YOUR-PROMPT');
  });
});
