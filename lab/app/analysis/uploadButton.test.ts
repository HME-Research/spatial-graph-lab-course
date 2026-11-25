import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { isNewReveal } from '@app/ui/Section';
import { ANALYSE_SECTION_IDS } from '@app/ui/analysisSections';
import { NO_SELECTION } from '@core/viewer/selection';
import { DEFAULT_EXPLAINER_WINDOW_SIZE, ExplainerView, ExplainerWindow, explainerWindowId } from '@app/ui/guide';
import { DEFAULT_MIN_SIZE, defaultState } from '@app/ui/floating/windowState';
import { UPLOAD_BUTTON_LABEL, UPLOAD_INFO, UPLOAD_NOTE, uploadLandingSection } from './analyseModel';
import { AnalyseCatalogue, AnalysePanel, type AnalysePanelProps } from './AnalysePanel';
import { UPLOAD_EXPLAINER_ID, UPLOAD_EXPLAINER_WINDOW_SIZE, uploadExplainer } from './uploadExplainer';

/**
 * "Upload your own (.ts)" is ONE button at the very top of the Analyse tab (owner, 19 November
 * 2026), with a plain note and an ⓘ (what an uploaded analysis is; the AI kit tabs); the
 * sections' "+" menus only list built-ins; after an upload the section it landed in opens.
 */

const noop = () => undefined;
const panel = (over: Partial<AnalysePanelProps> = {}) =>
  renderToStaticMarkup(
    createElement(AnalysePanel, { project: null, version: null, selection: NO_SELECTION, shown: null, onShow: noop, shownBuiltIns: [], onShownBuiltIns: noop, onUploads: noop, ...over }),
  );

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

  it('its ⓘ is a pop-up explainer: what an uploaded analysis is, then the AI kit tabs', () => {
    const explainer = uploadExplainer();
    expect(explainer.id).toBe(UPLOAD_EXPLAINER_ID);
    expect(explainer.summary).toBe(UPLOAD_INFO);
    expect(UPLOAD_INFO).toContain('it never changes your design');
    expect(explainer.aiKits).toBe(true);
    expect(explainer.downloads).toBeUndefined();
    const html = renderToStaticMarkup(createElement(ExplainerView, { explainer }));
    expect(html).toContain(UPLOAD_INFO);
    expect(html).toContain('data-ai-kits=""');
    expect(html).toContain('>Any project</button>');
  });

  it('its window opens larger than the default explainer, centred, under an id that a remembered older size cannot hide', () => {
    const explainer = uploadExplainer();
    expect(explainer.windowSize).toEqual(UPLOAD_EXPLAINER_WINDOW_SIZE);
    expect(UPLOAD_EXPLAINER_WINDOW_SIZE.width).toBeGreaterThan(DEFAULT_EXPLAINER_WINDOW_SIZE.width);
    expect(UPLOAD_EXPLAINER_WINDOW_SIZE.height).toBeGreaterThan(DEFAULT_EXPLAINER_WINDOW_SIZE.height);
    // Fits a 1366 × 768 screen, centred (the window's default state).
    const state = defaultState(UPLOAD_EXPLAINER_WINDOW_SIZE, DEFAULT_MIN_SIZE, { width: 1366, height: 768 });
    expect(state).toMatchObject({ ...UPLOAD_EXPLAINER_WINDOW_SIZE, x: (1366 - 560) / 2, y: (768 - 600) / 2 });
    // The remembered place is keyed by the size: older entries (560 × 560, 440 × 360) are not read.
    const id = explainerWindowId(explainer);
    expect(id).toBe('explainer-upload-your-own@560x600');
    const html = renderToStaticMarkup(createElement(ExplainerWindow, { explainer, open: true, onClose: noop }));
    expect(html).toContain(`data-floating="${id}"`);
    expect(html).toMatch(/width:560px;height:600px/);
    // Every other explainer opens at the default size, under an id that carries it.
    expect(explainerWindowId({ id: 'degree' })).toBe('explainer-degree@520x480');
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
