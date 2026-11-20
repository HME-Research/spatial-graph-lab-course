import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { isNewReveal } from '@app/ui/Section';
import { ANALYSE_SECTION_IDS } from '@app/ui/analysisSections';
import { NO_SELECTION } from '@core/viewer/selection';
import { DEFAULT_EXPLAINER_WINDOW_SIZE, ExplainerView, ExplainerWindow, explainerWindowId } from '@app/ui/guide';
import { DEFAULT_MIN_SIZE, defaultState } from '@app/ui/floating/windowState';
import type { GuideDownload } from '@app/ui/guideContracts';
import { AI_KIT_FILE_NAME, AI_KIT_PATH, aiKitUrl, TEMPLATE_FILE_NAME, UPLOAD_BUTTON_LABEL, UPLOAD_INFO, UPLOAD_NOTE, uploadLandingSection } from './analyseModel';
import { AnalyseCatalogue, AnalysePanel, type AnalysePanelProps } from './AnalysePanel';
import { UPLOAD_EXPLAINER_ID, UPLOAD_EXPLAINER_WINDOW_SIZE, uploadExplainer } from './uploadExplainer';

/**
 * "Upload your own (.ts)" is ONE button at the very top of the Analyse tab (owner, 19 November
 * 2026), with a plain note and an ⓘ (what an analysis reads; the AI kit and the template); the
 * sections' "+" menus only list built-ins; after an upload the section it landed in opens.
 */

const noop = () => undefined;
const panel = (over: Partial<AnalysePanelProps> = {}) =>
  renderToStaticMarkup(
    createElement(AnalysePanel, { project: null, version: null, selection: NO_SELECTION, shown: null, onShow: noop, shownBuiltIns: [], onShownBuiltIns: noop, onUploads: noop, ...over }),
  );
const fs = (globalThis as unknown as { process: { getBuiltinModule(id: string): { existsSync(url: URL): boolean } } }).process.getBuiltinModule('node:fs');

describe('Upload your own analysis: one button at the top of Analyse', () => {
  it('comes first in the tab, once, with its note and an ⓘ', () => {
    const html = panel();
    const button = html.indexOf('data-upload="new"');
    expect(button).toBeGreaterThan(-1);
    expect(html.indexOf('data-upload="new"', button + 1)).toBe(-1);
    expect(button).toBeLessThan(html.indexOf('sgl-tab-intro'));
    expect(button).toBeLessThan(html.indexOf('data-section="analyse-node"'));
    expect(html).toContain(`>${UPLOAD_BUTTON_LABEL}<`);
    expect(UPLOAD_BUTTON_LABEL).toBe('Upload your own (.ts)');
    expect(html).toContain(UPLOAD_NOTE);
    expect(html).toContain('aria-label="About uploading your own analysis"');
    // The ⓘ opens the shared pop-up explainer window; there is no inline panel any more.
    expect(html).toMatch(/aria-label="About uploading your own analysis"[^>]*aria-haspopup="dialog"/);
    expect(html).not.toContain('sgl-analyse-upload-info');
    expect(html).not.toContain(UPLOAD_INFO);
  });

  it('is not offered when the project cannot store uploads', () => {
    expect(panel({ onUploads: undefined as never })).not.toContain('data-upload');
  });

  it('is no longer an item of any "+" menu', () => {
    for (const section of ANALYSE_SECTION_IDS) {
      const html = renderToStaticMarkup(createElement(AnalyseCatalogue, { section, shownBuiltIns: [], onShownBuiltIns: noop, onDone: noop }));
      expect(html).not.toContain('data-upload');
      expect(html).not.toContain('Upload');
      expect(html).toContain('Done');
    }
  });

  it('its ⓘ is a pop-up explainer: what an analysis reads, the AI kit (a plain link, served from public/) and the template', () => {
    const explainer = uploadExplainer(import.meta.env.BASE_URL);
    expect(explainer.id).toBe(UPLOAD_EXPLAINER_ID);
    expect(explainer.summary).toBe(UPLOAD_INFO);
    expect(UPLOAD_INFO).toContain('room ids and the relationships');
    const [kit, template] = explainer.downloads as readonly GuideDownload[];
    expect(kit).toMatchObject({ fileName: AI_KIT_FILE_NAME, href: aiKitUrl(import.meta.env.BASE_URL) });
    expect(template).toMatchObject({ fileName: TEMPLATE_FILE_NAME });
    expect(template && 'load' in template).toBe(true);
    expect(uploadExplainer('/lab/').downloads?.[0]).toMatchObject({ href: '/lab/downloads/spatial-graph-lab-ai-kit.zip' });
    // Rendered by the shared explainer view: the zip as a download link, the template as a button.
    const html = renderToStaticMarkup(createElement(ExplainerView, { explainer }));
    expect(html).toContain(UPLOAD_INFO);
    expect(html).toContain(
      `<a class="sgl-explainer-download" href="${aiKitUrl(import.meta.env.BASE_URL)}" download="${AI_KIT_FILE_NAME}" data-download="${AI_KIT_FILE_NAME}">⤓ AI kit (.zip)</a>`,
    );
    expect(html).toContain('— attach it to an AI assistant and describe your idea.');
    expect(html).toMatch(/<button type="button" class="sgl-explainer-download" data-download="graph-analysis-template.ts">⤓ Template \(.ts\)<\/button>/);
    expect(html).toContain('— change it yourself, then upload it here.');
    expect(aiKitUrl('/')).toBe('/downloads/spatial-graph-lab-ai-kit.zip');
    expect(aiKitUrl('/lab')).toBe('/lab/downloads/spatial-graph-lab-ai-kit.zip');
    expect(aiKitUrl('./')).toBe('./downloads/spatial-graph-lab-ai-kit.zip');
    expect(fs.existsSync(new URL(`../../public/${AI_KIT_PATH}`, import.meta.url))).toBe(true);
  });

  it('its window opens larger than the default explainer, centred, under an id that a remembered older size cannot hide', () => {
    const explainer = uploadExplainer('/');
    expect(explainer.windowSize).toEqual(UPLOAD_EXPLAINER_WINDOW_SIZE);
    expect(UPLOAD_EXPLAINER_WINDOW_SIZE.width).toBeGreaterThan(DEFAULT_EXPLAINER_WINDOW_SIZE.width);
    expect(UPLOAD_EXPLAINER_WINDOW_SIZE.height).toBeGreaterThan(DEFAULT_EXPLAINER_WINDOW_SIZE.height);
    // Fits a 1366 × 768 screen, centred (the window's default state).
    const state = defaultState(UPLOAD_EXPLAINER_WINDOW_SIZE, DEFAULT_MIN_SIZE, { width: 1366, height: 768 });
    expect(state).toMatchObject({ ...UPLOAD_EXPLAINER_WINDOW_SIZE, x: (1366 - 440) / 2, y: (768 - 360) / 2 });
    // The remembered place is keyed by the size: the old 360 × 300 entry ("explainer-upload-your-own") is not read.
    const id = explainerWindowId(explainer);
    expect(id).toBe('explainer-upload-your-own@440x360');
    const html = renderToStaticMarkup(createElement(ExplainerWindow, { explainer, open: true, onClose: noop }));
    expect(html).toContain(`data-floating="${id}"`);
    expect(html).toMatch(/width:440px;height:360px/);
    // Other explainers keep their id and the default size.
    expect(explainerWindowId({ id: 'degree' })).toBe('explainer-degree');
  });

  it('the template download loads the real template text on click', async () => {
    const template = uploadExplainer('/').downloads?.[1];
    if (!template || !('load' in template)) throw new Error('expected a text download');
    expect(await template.load()).toContain('defineGraphAlgorithm');
  });

  it('opens the section the upload landed in, from its inputs', () => {
    expect(uploadLandingSection([])).toBe('network');
    expect(uploadLandingSection([{ kind: 'node', label: 'Room' }])).toBe('node');
    expect(uploadLandingSection([{ kind: 'edge', label: 'Link' }])).toBe('edge');
    expect(
      uploadLandingSection([
        { kind: 'node', label: 'From' },
        { kind: 'node', label: 'To' },
      ]),
    ).toBe('queries');
    // A collapsed section opens on each NEW reveal request only.
    expect(isNewReveal(undefined, undefined)).toBe(false);
    expect(isNewReveal(undefined, 0)).toBe(false);
    expect(isNewReveal(undefined, 1)).toBe(true);
    expect(isNewReveal(1, 1)).toBe(false);
    expect(isNewReveal(1, 2)).toBe(true);
  });
});
