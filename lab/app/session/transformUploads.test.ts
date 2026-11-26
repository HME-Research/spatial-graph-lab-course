import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ANALYSIS_REFUSAL, MAX_UPLOADED_TRANSFORMS, type StoredUpload, type UploadRunner } from '@app/extensions';
import { handleUploadRequest } from '@app/extensions/uploadSandbox';
import { readProjectFile, serializeProjectFile } from '@app/project';
import { ExplainerView } from '@app/ui/guide';
import { newUploadId } from '@app/analysis/uploads';
import { fileOf } from './projectStore.fixtures';
import { openProject, projectFileOf, setUploadedTransforms } from './projectStore';
import { TransformPanel, type TransformPanelProps } from './TransformPanel';
import { TRANSFORM_EXPLAINER, TRANSFORM_UPLOAD_BUTTON_LABEL, TRANSFORM_UPLOAD_NOTE, transformUploadExplainer } from './transformExplainers';
import { addTransformUpload, transformUploadEntries, yoursTransformKey, type LoadedTransform } from './transformUploads';

/**
 * Uploaded transforms in the Transform tab (owner 2026-11-25), mirroring Analyse: one "Upload your
 * own (.ts)" button at the top with an ⓘ (the transform kits), a "Yours" section (loading / failed
 * uploads listed disabled with the reason), add / replace / remove checked before anything is
 * stored, and the project file keeps the source text (`settings.uploadedTransforms`).
 */

/** Kept out of import-like text so the layering check does not read the sample as an import. */
const API = ['@student', 'api'].join('-');

const inProcess: UploadRunner = async (request) => structuredClone(handleUploadRequest(structuredClone(request)));

const source = (id: string, parameters = '{}') =>
  `import { defineSpatialAlgorithm } from '${API}';\nexport default defineSpatialAlgorithm({ id: '${id}', label: 'Label ${id}', parameters: ${parameters}, run: () => ({ kind: 'transformation', operations: [] }) });\n`;
const file = (name: string, text: string) => ({ name, size: new TextEncoder().encode(text).length, text: async () => text });
const NOW = new Date('2026-11-25T12:00:00.000Z');
const stored = (id: string): StoredUpload => ({ id, fileName: `${id}.ts`, source: '', addedAt: NOW.toISOString() });

describe('uploaded transforms listed in Transform', () => {
  it('ready ones with their label and parameters; loading and failed ones disabled with the reason', () => {
    const loaded: LoadedTransform[] = [
      { stored: stored('u1'), status: { ok: true, code: '', definition: { id: 'grow', label: 'Grow', parameters: { steps: { kind: 'number', default: 1, label: 'Steps' } } } } },
      { stored: stored('u2'), status: { ok: false, problems: ['Syntax error on line 2, column 5: Unexpected token'] } },
      { stored: stored('u3'), status: 'loading' },
    ];
    const [grow, broken, loading] = transformUploadEntries(loaded);
    expect(grow).toMatchObject({ key: yoursTransformKey('u1'), id: 'grow', label: 'Grow', scope: 'spatial', enabled: true, problems: [], loading: false });
    expect(grow!.parameters).toEqual([['steps', { kind: 'number', default: 1, label: 'Steps' }]]);
    expect(broken).toMatchObject({ label: 'u2.ts', enabled: false, problems: ['Syntax error on line 2, column 5: Unexpected token'], parameters: [], loading: false });
    expect(loading).toMatchObject({ label: 'u3.ts', enabled: false, problems: ['Loading…'], loading: true });
  });
});

describe('adding, replacing and refusing uploaded transforms', () => {
  it('appends a valid file with its source text; Replace keeps the place and id', async () => {
    const first = await addTransformUpload(file('a.ts', source('aa')), [], null, { now: NOW, runner: inProcess });
    if (!first.ok) throw new Error(first.problems.join());
    expect(first.uploads).toEqual([{ id: newUploadId([], NOW.getTime()), fileName: 'a.ts', source: source('aa'), addedAt: NOW.toISOString() }]);
    expect(first.definition).toEqual({ id: 'aa', label: 'Label aa', parameters: {} });

    const loaded: LoadedTransform[] = [
      { stored: first.uploads[0]!, status: { ok: true, code: '', definition: { id: 'aa', label: 'Label aa', parameters: {} } } },
      { stored: { id: 'other', fileName: 'b.ts', source: 'x', addedAt: NOW.toISOString() }, status: { ok: false, problems: ['x'] } },
    ];
    const replaced = await addTransformUpload(file('a2.ts', source('aa', "{ n: { kind: 'number', default: 2 } }")), loaded, first.uploads[0]!.id, { now: NOW, runner: inProcess });
    if (!replaced.ok) throw new Error(replaced.problems.join());
    expect(replaced.uploads.map((u) => [u.id, u.fileName])).toEqual([
      [first.uploads[0]!.id, 'a2.ts'],
      ['other', 'b.ts'],
    ]);
    expect(replaced.definition.parameters).toEqual({ n: { kind: 'number', default: 2 } });

    // The same transform id as another upload is refused (Replace it instead).
    const clash = await addTransformUpload(file('copy.ts', source('aa')), loaded, null, { now: NOW, runner: inProcess });
    expect(clash).toEqual({ ok: false, problems: ['You already uploaded a transform with the id "aa" (a.ts). Use Replace on it, or give this one another id.'] });
  });

  it('refuses an analysis (it belongs in Analyse), other file types, too many uploads', async () => {
    const analysis = `import { defineGraphAlgorithm } from '${API}';\nexport default defineGraphAlgorithm({ id: 'g', label: 'G', inputs: [], run: () => ({ kind: 'analysis', value: 1 }) });\n`;
    expect(await addTransformUpload(file('g.ts', analysis), [], null, { runner: inProcess })).toEqual({ ok: false, problems: [ANALYSIS_REFUSAL] });
    expect(await addTransformUpload(file('a.py', 'x'), [], null, { runner: inProcess })).toEqual({ ok: false, problems: ['"a.py" is not a .ts or .js file. Upload the transform as a .ts file.'] });
    const full = Array.from({ length: MAX_UPLOADED_TRANSFORMS }, (_, n): LoadedTransform => ({ stored: stored(`u${n}`), status: 'loading' }));
    expect(await addTransformUpload(file('a.ts', source('aa')), full, null, { runner: inProcess })).toEqual({
      ok: false,
      problems: ['A project can hold at most 20 uploaded transforms. Remove one first.'],
    });
  });
});

describe('the project keeps uploaded transforms', () => {
  it('setUploadedTransforms stores source text that Export and Open keep; the same list changes nothing', () => {
    const project = openProject(fileOf(), { kind: 'created', label: 'test' });
    const uploads = [{ id: 'upload-1', fileName: 'a.ts', source: source('aa'), addedAt: NOW.toISOString() }];
    const next = setUploadedTransforms(project, uploads);
    expect(next.meta.settings.uploadedTransforms).toEqual(uploads);
    expect(setUploadedTransforms(next, uploads.map((u) => ({ ...u })))).toBe(next);
    const file = projectFileOf(next);
    if (!file.ok) throw new Error('invalid project file');
    const reopened = readProjectFile(serializeProjectFile(file.value));
    expect(reopened.ok && reopened.value.settings.uploadedTransforms).toEqual(uploads);
  });
});

const noop = () => undefined;
const panel = (over: Partial<TransformPanelProps> = {}) =>
  renderToStaticMarkup(
    createElement(TransformPanel, { project: null, version: null, onApply: () => ({ ok: false as const, reason: 'no-document' as const, message: '' }), onSelect: noop, onUploads: noop, ...over }),
  );

describe('Transform tab: Upload your own (.ts) and its explainers', () => {
  it('one upload button at the very top, with its note and an ⓘ, before the tab summary', () => {
    const html = panel();
    const button = html.indexOf('data-upload="new"');
    expect(button).toBeGreaterThan(-1);
    expect(html.indexOf('data-upload="new"', button + 1)).toBe(-1);
    expect(button).toBeLessThan(html.indexOf('sgl-tab-intro'));
    expect(html).toContain(`>${TRANSFORM_UPLOAD_BUTTON_LABEL}<`);
    expect(TRANSFORM_UPLOAD_BUTTON_LABEL).toBe('Upload your own (.ts)');
    expect(html).toContain(TRANSFORM_UPLOAD_NOTE);
    expect(html).toMatch(/aria-label="About uploading your own transform"[^>]*aria-haspopup="dialog"/);
    expect(html).toContain('data-upload-input');
  });

  it('the tab’s own ⓘ is the Transform explainer, not Analyse vs Transform', () => {
    const html = panel();
    expect(html).toContain('aria-label="About Transform"');
    expect(html).not.toContain('Analyse vs Transform');
    expect(TRANSFORM_EXPLAINER.learnMore).toBeUndefined();
  });

  it('the empty state mentions the upload; uploading is not offered without a project', () => {
    expect(panel()).toContain('No transformations yet. Upload your own (.ts) above');
    const without = panel({ onUploads: undefined as never });
    expect(without).not.toContain('data-upload');
    expect(without).toContain('Open a project to upload your own (.ts)');
  });

  it('lists stored uploads under Yours (Loading… until their worker has answered)', () => {
    const html = panel({ uploads: [stored('u1')] });
    expect(html).toContain('data-transform-section="yours"');
    expect(html).toContain('>Yours</h3>');
    expect(html).toContain('Loading u1.ts…');
    expect(html).toContain('aria-label="Replace u1.ts with a new version"');
    expect(html).toContain('aria-label="Remove u1.ts"');
  });

  it('the upload ⓘ shows what an uploaded transform is, then the transform kit tabs', () => {
    const explainer = transformUploadExplainer();
    expect(explainer).toMatchObject({ id: 'upload-your-own-transform', title: 'Upload your own transform', aiKits: 'transform' });
    const html = renderToStaticMarkup(createElement(ExplainerView, { explainer }));
    expect(html).toContain('data-ai-kits="transform"');
    expect([...html.matchAll(/role="tab"[^>]*>([^<]+)<\/button>/g)].map((m) => m[1])).toEqual(['Any project', 'This project', 'Template']);
    expect(html).toContain('data-download="spatial-graph-lab-transform-kit.zip"');
    expect(html).toContain('the Spatial Graph Lab transform kit');
  });
});
