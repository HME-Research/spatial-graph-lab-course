import { describe, expect, it } from 'vitest';
import type { StoredUpload, UploadRunner } from '@app/extensions';
import { handleUploadRequest } from '@app/extensions/uploadSandbox';
import { analysisItems, itemsBySection, yoursKey } from './analyseModel';
import { uploadedExplainer } from './explainers';
import { addUpload, newUploadId, storedFileName, uploadEntries, type LoadedUpload } from './uploads';

/** Kept out of import-like text so the layering check does not read the sample as an import. */
const API = ['@student', 'api'].join('-');

const inProcess: UploadRunner = async (request) => structuredClone(handleUploadRequest(structuredClone(request)));

const source = (id: string, inputs: string) =>
  `import { defineGraphAlgorithm } from '${API}';\nexport default defineGraphAlgorithm({ id: '${id}', label: 'Label ${id}', inputs: ${inputs}, run: () => ({ kind: 'analysis', value: 1 }) });\n`;
const file = (name: string, text: string) => ({ name, size: new TextEncoder().encode(text).length, text: async () => text });
const NOW = new Date('2026-11-19T12:00:00.000Z');

describe('uploaded analyses in the Analyse panel', () => {
  it('are listed last, tagged Yours, in the section their inputs give; failed or loading ones disabled in Network', () => {
    const stored = (id: string): StoredUpload => ({ id, fileName: `${id}.ts`, source: '', addedAt: NOW.toISOString() });
    const loaded: LoadedUpload[] = [
      { stored: stored('u1'), status: { ok: true, code: '', definition: { scope: 'graph', id: 'pair', label: 'Pair', inputs: [{ kind: 'node', label: 'A' }, { kind: 'node', label: 'B' }] } } },
      { stored: stored('u2'), status: { ok: false, problems: ['Syntax error on line 2, column 5: Unexpected token'] } },
      { stored: stored('u3'), status: 'loading' },
    ];
    const items = analysisItems(['degree'], null, uploadEntries(loaded));
    expect(items.map((i) => i.key)).toEqual(['built-in:degree', yoursKey('u1'), yoursKey('u2'), yoursKey('u3')]);
    const [, pair, broken, loading] = items;
    expect(pair).toMatchObject({ name: 'Pair', section: 'queries', source: { kind: 'yours' }, enabled: true });
    expect(broken).toMatchObject({ name: 'u2.ts', section: 'network', enabled: false, problems: ['Syntax error on line 2, column 5: Unexpected token'] });
    expect(loading).toMatchObject({ section: 'network', enabled: false });
    expect(itemsBySection(items, 'yours').queries.map((i) => i.key)).toEqual([yoursKey('u1')]);
    expect(itemsBySection(items, 'built-in').queries).toEqual([]);
  });

  it('builds the ⓘ from the definition (its own name and description)', () => {
    const info = uploadedExplainer({ uploadId: 'u1', fileName: 'pair.ts', definition: { label: 'Pair', description: 'Whether two nodes touch.', inputs: [{ kind: 'node', label: 'A' }] } });
    expect(info).toMatchObject({ title: 'Pair', summary: 'Whether two nodes touch.', example: 'Inputs: A (a node). Uploaded from pair.ts.' });
    expect(uploadedExplainer({ uploadId: 'u1', fileName: 'x.ts', definition: { label: 'X', inputs: [] } }).example).toContain('none: it reads the whole graph');
  });
});

describe('adding, replacing and refusing uploads', () => {
  it('appends a valid file with its source text; Replace keeps the place and id', async () => {
    const first = await addUpload(file('a.ts', source('aa', '[]')), [], null, { now: NOW, runner: inProcess });
    if (!first.ok) throw new Error(first.problems.join());
    expect(first.uploads).toEqual([{ id: newUploadId([], NOW.getTime()), fileName: 'a.ts', source: source('aa', '[]'), addedAt: NOW.toISOString() }]);
    expect(first.definition.label).toBe('Label aa');

    const loaded: LoadedUpload[] = [
      { stored: first.uploads[0]!, status: { ok: true, code: '', definition: { scope: 'graph', id: 'aa', label: 'Label aa', inputs: [] } } },
      { stored: { id: 'other', fileName: 'b.ts', source: 'x', addedAt: NOW.toISOString() }, status: { ok: false, problems: ['x'] } },
    ];
    const replaced = await addUpload(file('a2.ts', source('aa', "[{ kind: 'node', label: 'N' }]")), loaded, first.uploads[0]!.id, { now: NOW, runner: inProcess });
    if (!replaced.ok) throw new Error(replaced.problems.join());
    expect(replaced.uploads.map((u) => [u.id, u.fileName])).toEqual([
      [first.uploads[0]!.id, 'a2.ts'],
      ['other', 'b.ts'],
    ]);

    // A second upload with the same analysis id is refused (Replace is the way to update it).
    const clash = await addUpload(file('copy.ts', source('aa', '[]')), loaded, null, { now: NOW, runner: inProcess });
    expect(clash).toEqual({ ok: false, problems: ['You already uploaded an analysis with the id "aa" (a.ts). Use Replace on it, or give this one another id.'] });
  });

  it('refuses before reading: wrong type or too large; and passes on compile problems', async () => {
    expect(await addUpload(file('a.py', 'x'), [], null, { runner: inProcess })).toEqual({ ok: false, problems: ['"a.py" is not a .ts or .js file. Upload the analysis as a .ts file.'] });
    expect(await addUpload({ name: 'big.ts', size: 250_000, text: async () => '' }, [], null, { runner: inProcess })).toEqual({
      ok: false,
      problems: ['"big.ts" is 250 KB; an uploaded analysis may be at most 100 KB.'],
    });
    const fs = await addUpload(file('fs.ts', `${['import fs', "'fs';"].join(' from ')}\n${source('bb', '[]')}`), [], null, { runner: inProcess });
    expect(fs).toEqual({ ok: false, problems: ['This file imports "fs". Uploaded analyses may import only "@student-api".'] });
  });

  it('stores the bare file name', () => {
    expect(storedFileName('C:\\fakepath\\mine.ts')).toBe('mine.ts');
    expect(storedFileName('a/b/c.ts')).toBe('c.ts');
  });
});
