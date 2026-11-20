import { describe, expect, it } from 'vitest';
import { defineToolkit } from '@student-api';
import type { FacadeAssetV1 } from '@app/assets';
import type { ImportFacadeResult } from '@app/assets/importFacade';
import { discoverToolkits } from './discover';
import { fakeGlobs, LAB_FILES } from './test-fixtures';
import { designAssetIds, listToolkitExamples, loadToolkitAssets, type ToolkitAssetIo } from './toolkitExamples';

const ID_A = 'facade-00000000000000aa';
const ID_B = 'facade-00000000000000bb';

const design = (name: string, metadata: Record<string, unknown> = {}) => JSON.stringify({ schemaVersion: 2, metadata: { name, ...metadata }, nodes: [], edges: [] });

const facadeLook = (assetId: string) => ({ facade: { assetId, placement: 'repeat' as const } });

/** A fake import: the file's text is the asset id it produces ("unit" = needs a unit, "bad" = refused). */
function fakeIo(log: string[] = []): ToolkitAssetIo {
  return {
    fetchBytes: async (url) => {
      log.push(`fetch ${url}`);
      return new TextEncoder().encode(url.replace(/^url:/, ''));
    },
    importFile: async (bytes, fileName): Promise<ImportFacadeResult> => {
      log.push(`import ${fileName}`);
      const text = new TextDecoder().decode(bytes);
      if (text === 'unit') return { status: 'needs-unit', warnings: [] };
      if (text === 'bad') return { status: 'refused', diagnostics: [{ severity: 'error', code: 'x', message: 'no meshes' }] };
      return { status: 'ok', asset: { id: text, name: fileName } as unknown as FacadeAssetV1, warnings: [] };
    },
  };
}

describe('toolkit examples (Open example…)', () => {
  it('lists every design of every toolkit with its name, description and toolkit name', async () => {
    const globs = fakeGlobs({
      ...LAB_FILES,
      'toolkits/lab/designs/b-second.json': design('Second', { description: '  Two rooms.  ' }),
      'toolkits/lab/designs/a-first.json': design('First'),
      'toolkits/lab/designs/broken.json': '{ not json',
      'toolkits/empty/toolkit.ts': { default: defineToolkit({ name: 'Empty' }) },
    });
    const examples = await listToolkitExamples(globs);
    expect(examples.map((e) => [e.toolkitId, e.toolkitName, e.designId, e.name, e.description, e.problem === null])).toEqual([
      ['lab', 'Lab', 'a-first', 'First', null, true],
      ['lab', 'Lab', 'b-second', 'Second', 'Two rooms.', true],
      ['lab', 'Lab', 'broken', 'broken', null, false],
    ]);
    expect(examples[2]!.problem).toContain('toolkits/lab/designs/broken.json');
  });

  it('falls back to the toolkit id when toolkit.ts is invalid', async () => {
    const examples = await listToolkitExamples(fakeGlobs({ 'toolkits/odd/toolkit.ts': { default: { name: '' } }, 'toolkits/odd/designs/one.json': design('One') }));
    expect(examples.map((e) => e.toolkitName)).toEqual(['odd']);
  });
});

describe('toolkit façade assets', () => {
  it('discovers .3dm files in assets/ only, by file name', () => {
    const { toolkits } = discoverToolkits(
      fakeGlobs({ ...LAB_FILES, 'toolkits/lab/assets/panel.3dm': 'url:x', 'toolkits/lab/assets/z.3dm': 'url:y', 'toolkits/lab/designs/assets.3dm': 'url:no' }),
    );
    expect(toolkits[0]!.assets.map((a) => [a.file, a.stem])).toEqual([
      ['toolkits/lab/assets/panel.3dm', 'panel.3dm'],
      ['toolkits/lab/assets/z.3dm', 'z.3dm'],
    ]);
  });

  it('collects the asset ids a design uses (façades and door / open bays of any card)', () => {
    const settings = {
      styleBy: 'function' as const,
      styles: {
        function: { default: facadeLook(ID_B), groups: [{ value: 'gallery', look: { facade: { assetId: ID_A, placement: 'stretch' as const, door: { assetId: ID_B } } } }] },
      },
    };
    expect(designAssetIds({ settings })).toEqual([ID_A, ID_B]);
  });

  const files = (entries: Record<string, string>) =>
    discoverToolkits(fakeGlobs({ ...LAB_FILES, ...Object.fromEntries(Object.entries(entries).map(([k, v]) => [`toolkits/lab/assets/${k}`, `url:${v}`])) })).toolkits[0]!.assets;

  it('imports nothing when the design uses no façade', async () => {
    const log: string[] = [];
    expect(await loadToolkitAssets('lab', files({ 'a.3dm': ID_A }), [], fakeIo(log))).toEqual({ ok: true, assets: [] });
    expect(log).toEqual([]);
  });

  it('imports the files in order and keeps the assets the design uses, stopping when all are found', async () => {
    const log: string[] = [];
    const result = await loadToolkitAssets('lab', files({ 'a.3dm': ID_A, 'b.3dm': ID_B, 'c.3dm': 'facade-00000000000000cc' }), [ID_B, ID_A], fakeIo(log));
    expect(result.ok && result.assets.map((a) => a.id)).toEqual([ID_A, ID_B]);
    expect(log).toEqual(['fetch url:' + ID_A, 'import a.3dm', 'fetch url:' + ID_B, 'import b.3dm']);
  });

  it('fails, naming the ids, when no file provides one', async () => {
    const result = await loadToolkitAssets('lab', files({ 'a.3dm': ID_A }), [ID_A, ID_B], fakeIo());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe(`the design uses façade ${ID_B}, which no file in toolkits/lab/assets/ provides (its files give a.3dm → ${ID_A})`);
    const none = await loadToolkitAssets('lab', [], [ID_A], fakeIo());
    expect(!none.ok && none.message).toContain('has no .3dm files');
  });

  it('fails on a file that cannot be imported, never returning a partial set', async () => {
    const unit = await loadToolkitAssets('lab', files({ 'a.3dm': 'unit' }), [ID_A], fakeIo());
    expect(!unit.ok && unit.message).toContain('has no unit');
    const bad = await loadToolkitAssets('lab', files({ 'a.3dm': 'bad' }), [ID_A], fakeIo());
    expect(!bad.ok && bad.message).toBe('toolkits/lab/assets/a.3dm could not be imported: no meshes');
    const failing: ToolkitAssetIo = { ...fakeIo(), fetchBytes: async () => Promise.reject(new Error('404')) };
    const unread = await loadToolkitAssets('lab', files({ 'a.3dm': ID_A }), [ID_A], failing);
    expect(!unread.ok && unread.message).toBe('toolkits/lab/assets/a.3dm could not be read: 404');
  });
});
