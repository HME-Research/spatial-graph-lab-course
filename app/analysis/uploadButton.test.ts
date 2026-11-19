import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { isNewReveal } from '@app/ui/Section';
import { ANALYSE_SECTION_IDS } from '@app/ui/analysisSections';
import { NO_SELECTION } from '@core/viewer/selection';
import { AI_KIT_PATH, aiKitUrl, UPLOAD_BUTTON_LABEL, UPLOAD_INFO, UPLOAD_NOTE, uploadLandingSection } from './analyseModel';
import { AnalyseCatalogue, AnalysePanel, UploadInfo, type AnalysePanelProps } from './AnalysePanel';

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
    // The ⓘ text is shown only when asked for.
    expect(html).not.toContain('data-upload-info');
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

  it('its ⓘ says what an analysis reads and links the AI kit (served from public/) and the template', () => {
    const html = renderToStaticMarkup(createElement(UploadInfo));
    expect(html).toContain(UPLOAD_INFO);
    expect(UPLOAD_INFO).toContain('room ids and the relationships');
    expect(html).toContain(`href="${aiKitUrl(import.meta.env.BASE_URL)}"`);
    expect(html).toMatch(/<a [^>]*download=""/);
    expect(html).toContain('data-download="template"');
    expect(aiKitUrl('/')).toBe('/downloads/spatial-graph-lab-ai-kit.zip');
    expect(aiKitUrl('/lab')).toBe('/lab/downloads/spatial-graph-lab-ai-kit.zip');
    expect(aiKitUrl('./')).toBe('./downloads/spatial-graph-lab-ai-kit.zip');
    expect(fs.existsSync(new URL(`../../public/${AI_KIT_PATH}`, import.meta.url))).toBe(true);
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
