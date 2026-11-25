import { describe, expect, it } from 'vitest';
import { expectOk } from '@app/document/test-fixtures';
import { validateDocumentV2, serializeDesignV2 } from '@app/document';
import { defineGraphAlgorithm, defineFunction, defineToolkit } from '@student-api';
import exampleJson from '../document/test-designs/two-storey.json';
import { activate, activateToolkit, projectOnlyToolkit, resolveStartupDesign, type Activation } from './activate';
import { withProjectFunctions } from './projectFunctions';
import { discoverToolkits, selectToolkit } from './discover';
import { fakeGlobs, galleryType, LAB_FILES, labToolkit, LOAD_FAILS } from './test-fixtures';

// The schema-v2 two-storey test design stands in for the built-in example.
const builtInDoc = expectOk(validateDocumentV2(exampleJson));
const builtIn = { doc: builtInDoc, source: 'app/document/test-designs/two-storey.json' };
const analysis = () => ({ kind: 'analysis' as const, value: 1 });

describe('toolkit discovery', () => {
  it('groups glob entries by toolkit folder, sorted, ignoring test files', () => {
    const { toolkits, diagnostics } = discoverToolkits(
      fakeGlobs({
        ...LAB_FILES,
        'toolkits/lab/functions/gallery.test.ts': { default: {} },
        'toolkits/lab/designs/b.json': '{}',
        'toolkits/lab/designs/a.json': '{}',
      }),
    );
    expect(diagnostics).toEqual([]);
    expect(toolkits.map((p) => p.id)).toEqual(['lab']);
    const lab = toolkits[0]!;
    expect(lab.functions.map((t) => t.file)).toEqual(['toolkits/lab/functions/gallery.ts', 'toolkits/lab/functions/studio.ts']);
    expect(lab.designs.map((d) => d.stem)).toEqual(['a', 'b']);
  });

  it('reports folders without toolkit.ts and folders with invalid names', () => {
    const { toolkits, diagnostics } = discoverToolkits(
      fakeGlobs({ 'toolkits/orphan/functions/a.ts': {}, 'toolkits/Bad_Name/toolkit.ts': {} }),
    );
    expect(toolkits).toEqual([]);
    expect(diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ['invalid-toolkit-folder', 'error'],
      ['missing-toolkit-file', 'error'],
    ]);
  });

  it('accepts "_" in toolkit folder names (unlike node type ids)', () => {
    const { toolkits, diagnostics } = discoverToolkits(
      fakeGlobs({ 'toolkits/level_1_growth/toolkit.ts': {}, 'toolkits/1_bad/toolkit.ts': {}, 'toolkits/Bad_Name/toolkit.ts': {} }),
    );
    expect(toolkits.map((t) => t.id)).toEqual(['level_1_growth']);
    expect(diagnostics.map((d) => d.subject)).toEqual([
      { kind: 'file', path: 'toolkits/1_bad' },
      { kind: 'file', path: 'toolkits/Bad_Name' },
    ]);
  });
});

describe('toolkit selection', () => {
  const available = ['house', 'lab'];
  it('prefers the URL, then the environment, then no toolkit', () => {
    expect(selectToolkit(available, { query: 'lab', env: 'house' }).id).toBe('lab');
    expect(selectToolkit(available, { query: '', env: 'lab' }).id).toBe('lab');
    expect(selectToolkit(available, {}).id).toBeNull();
    expect(selectToolkit([], {}).id).toBeNull();
  });

  it('never silently falls back when the requested toolkit does not exist', () => {
    const r = selectToolkit(available, { query: 'nope' });
    expect(r.id).toBeNull();
    expect(r.diagnostic).toMatchObject({ code: 'unknown-toolkit', severity: 'error', id: 'unknown-toolkit|toolkit:nope' });
  });
});

describe('toolkit activation', () => {
  it('activates a valid toolkit with plain-data registries', async () => {
    const toolkit = await labToolkit({
      'toolkits/lab/algorithms/a.ts': { default: defineGraphAlgorithm({ id: 'a', label: 'A', inputs: [], run: analysis }) },
    });
    expect(toolkit.id).toBe('lab');
    expect(toolkit.definition).toEqual({ name: 'Lab' });
    expect(toolkit.functions.map((t) => [t.id, t.status.ok])).toEqual([
      ['gallery', true],
      ['studio', true],
    ]);
    expect(toolkit.functions[0]!.definition).toBe(galleryType); // the student's own object
    expect(toolkit.algorithms.map((a) => [a.id, a.definition.scope, a.status.ok])).toEqual([['a', 'graph', true]]);
    expect(toolkit.diagnostics).toEqual([]);
  });

  it('fails activation (with a conspicuous error) for an invalid or missing toolkit definition', async () => {
    for (const value of [{ default: { title: 'x' } }, { notDefault: 1 }, LOAD_FAILS]) {
      const { activation } = await activate(fakeGlobs({ ...LAB_FILES, 'toolkits/lab/toolkit.ts': value }), { query: 'lab' });
      expect(activation.status).toBe('failed');
      if (activation.status !== 'failed') continue;
      expect(activation.diagnostics[0]!.severity).toBe('error');
      expect(['invalid-toolkit-definition', 'missing-default-export', 'module-load-failed']).toContain(activation.diagnostics[0]!.code);
    }
  });

  it('disables invalid node types but keeps them registered as broken (no silent fallback)', async () => {
    const broken = { id: 'gallery', label: 'Gallery', facade: { windowFraction: 1.5 }, colour: '#fff' };
    const toolkit = await labToolkit({ 'toolkits/lab/functions/gallery.ts': { default: broken } });
    const gallery = toolkit.functions.find((t) => t.id === 'gallery')!;
    expect(gallery.status.ok).toBe(false);
    const d = toolkit.diagnostics.find((x) => x.code === 'invalid-node-type')!;
    expect(d.severity).toBe('error');
    expect(d.message).toContain('windowFraction must be between 0 and 1');
    expect(d.message).toContain('colour'); // unknown field reported, not ignored
    expect(d.message).toContain('disabled');
    expect(toolkit.functions.find((t) => t.id === 'studio')!.status.ok).toBe(true);
  });

  it.each([
    ['enum default not in values', { daylight: { kind: 'enum', values: ['a'], default: 'b' } }],
    ['duplicate enum values', { daylight: { kind: 'enum', values: ['a', 'a'] } }],
    ['min greater than max', { n: { kind: 'number', min: 2, max: 1 } }],
    ['default outside range', { n: { kind: 'number', min: 0, default: -1 } }],
    ['unknown kind', { n: { kind: 'colour' } }],
    ['unsupported option', { n: { kind: 'number', required: true } }],
  ])('rejects attribute definitions with %s', async (_name, attributes) => {
    const toolkit = await labToolkit({ 'toolkits/lab/functions/gallery.ts': { default: { id: 'gallery', label: 'G', custom: attributes } } });
    expect(toolkit.functions.find((t) => t.id === 'gallery')!.status.ok).toBe(false);
  });

  it('reports a type file whose id cannot be read, and files that fail to load', async () => {
    const toolkit = await labToolkit({
      'toolkits/lab/functions/x.ts': { default: { label: 'no id' } },
      'toolkits/lab/functions/y.ts': LOAD_FAILS,
    });
    expect(toolkit.functions.map((t) => t.id)).toEqual(['gallery', 'studio']);
    expect(toolkit.diagnostics.map((d) => d.code).sort()).toEqual(['invalid-node-type', 'module-load-failed']);
  });

  it('disables every definition sharing an id and names both files', async () => {
    const copy = defineFunction({ id: 'studio', label: 'Studio again' });
    const toolkit = await labToolkit({
      'toolkits/lab/functions/studio-2.ts': { default: copy },
      'toolkits/lab/algorithms/a.ts': { default: defineGraphAlgorithm({ id: 'dup', label: 'A', inputs: [], run: analysis }) },
      'toolkits/lab/algorithms/b.ts': { default: defineGraphAlgorithm({ id: 'dup', label: 'B', inputs: [], run: analysis }) },
    });
    const studios = toolkit.functions.filter((t) => t.id === 'studio');
    expect(studios.map((t) => t.status.ok)).toEqual([false, false]);
    const dupType = toolkit.diagnostics.filter((d) => d.code === 'duplicate-node-type');
    expect(dupType).toHaveLength(2);
    expect(dupType[0]!.message).toContain('toolkits/lab/functions/studio-2.ts');
    expect(toolkit.algorithms.map((a) => a.status.ok)).toEqual([false, false]);
    expect(toolkit.diagnostics.filter((d) => d.code === 'duplicate-algorithm')).toHaveLength(2);
  });

  it('rejects algorithms that were not created with a define helper', async () => {
    const toolkit = await labToolkit({ 'toolkits/lab/algorithms/a.ts': { default: { id: 'a', label: 'A', run: analysis } } });
    expect(toolkit.algorithms[0]!.status.ok).toBe(false);
    expect(toolkit.diagnostics[0]!.message).toContain('defineGraphAlgorithm');
  });

  it('registers invalid designs as unloadable with an error', async () => {
    const toolkit = await labToolkit({
      'toolkits/lab/designs/good.json': serializeDesignV2(builtInDoc),
      'toolkits/lab/designs/bad.json': '{ nope',
    });
    expect(toolkit.designs.map((d) => [d.id, d.result.ok])).toEqual([
      ['bad', false],
      ['good', true],
    ]);
    expect(toolkit.diagnostics.map((d) => d.code)).toEqual(['invalid-design']);
  });

  it('reports a missing or invalid defaultDesign', async () => {
    const missing = await labToolkit({ 'toolkits/lab/toolkit.ts': { default: defineToolkit({ name: 'Lab', defaultDesign: 'nope' }) } });
    expect(missing.diagnostics.map((d) => d.code)).toEqual(['default-design-missing']);
    const invalid = await labToolkit({
      'toolkits/lab/toolkit.ts': { default: defineToolkit({ name: 'Lab', defaultDesign: 'bad' }) },
      'toolkits/lab/designs/bad.json': '{}',
    });
    expect(invalid.diagnostics.map((d) => d.code)).toEqual(['invalid-design', 'default-design-invalid']);
  });

  it('returns status none when no toolkit exists and none was requested', async () => {
    expect((await activate(fakeGlobs({}), {})).activation).toEqual({ status: 'none' });
  });

  it('activateToolkit never throws for a module that fails to load', async () => {
    const { toolkits } = discoverToolkits(fakeGlobs({ 'toolkits/lab/toolkit.ts': LOAD_FAILS }));
    const a = await activateToolkit(toolkits[0]!);
    expect(a.status).toBe('failed');
  });

});

describe('startup design and fallback', () => {
  const active = async (files: Readonly<Record<string, unknown>>): Promise<Activation> =>
    (await activate(fakeGlobs({ ...LAB_FILES, ...files }), { query: 'lab' })).activation;

  it('no toolkit → built-in example, no diagnostics', () => {
    expect(resolveStartupDesign({ status: 'none' }, builtIn)).toEqual({ ...builtIn, diagnostics: [] });
  });

  it('failed activation → built-in example plus persistent diagnostics', async () => {
    const { activation } = await activate(fakeGlobs(LAB_FILES), { query: 'missing-toolkit' });
    const start = resolveStartupDesign(activation, builtIn);
    expect(start.doc).toBe(builtIn.doc);
    expect(start.diagnostics.map((d) => d.code)).toEqual(['unknown-toolkit']);
  });

  it('active toolkit without defaultDesign → built-in example', async () => {
    expect(resolveStartupDesign(await active({}), builtIn).doc).toBe(builtIn.doc);
  });

  it('active toolkit with a valid defaultDesign → that design', async () => {
    const start = resolveStartupDesign(
      await active({
        'toolkits/lab/toolkit.ts': { default: defineToolkit({ name: 'Lab', defaultDesign: 'mine' }) },
        'toolkits/lab/designs/mine.json': serializeDesignV2({ ...builtInDoc, metadata: { name: 'Mine' } }),
      }),
      builtIn,
    );
    expect(start.doc?.metadata.name).toBe('Mine');
    expect(start.source).toBe('toolkits/lab/designs/mine.json');
  });

  it('active toolkit with a broken defaultDesign → nothing loaded, with the error', async () => {
    const start = resolveStartupDesign(
      await active({ 'toolkits/lab/toolkit.ts': { default: defineToolkit({ name: 'Lab', defaultDesign: 'gone' }) } }),
      builtIn,
    );
    expect(start.doc).toBeNull();
    expect(start.diagnostics.map((d) => d.code)).toEqual(['default-design-missing']);
  });
});

describe('a project without a toolkit (P4)', () => {
  it('has an empty registry owned by the project, so project functions are listed like any other', () => {
    const bare = projectOnlyToolkit('project-abc123');
    expect(bare).toMatchObject({ id: 'project-abc123', functions: [], algorithms: [], designs: [], diagnostics: [] });
    expect(bare.attributeBaseline.schema.nodes).toEqual([]);
    const withFunctions = withProjectFunctions(bare, [{ id: 'kitchen', label: 'Kitchen' }]);
    expect(withFunctions.functions.map((t) => [t.id, t.definition.label, t.status.ok])).toEqual([['kitchen', 'Kitchen', true]]);
  });
});
