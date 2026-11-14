import { describe, expect, it } from 'vitest';
import { expectOk } from '@app/document/test-fixtures';
import { serializeDesign, validateDocument } from '@app/document';
import { defineGraphAlgorithm, defineNodeType, defineProject } from '@student-api';
import exampleJson from '../document/examples/two-storey-example.json';
import { activate, activateProject, resolveStartupDesign, type Activation } from './activate';
import { DEFAULT_PROJECT_ID, discoverProjects, selectProject } from './discover';
import { fakeGlobs, galleryType, LAB_FILES, labProject, LOAD_FAILS } from './test-fixtures';

const builtIn = { doc: expectOk(validateDocument(exampleJson)), source: 'app/document/examples/two-storey-example.json' };
const analysis = () => ({ kind: 'analysis' as const, nodeValues: {} });

describe('project discovery', () => {
  it('groups glob entries by project folder, sorted, ignoring test files', () => {
    const { projects, diagnostics } = discoverProjects(
      fakeGlobs({
        ...LAB_FILES,
        'projects/lab/types/gallery.test.ts': { default: {} },
        'projects/lab/designs/b.json': '{}',
        'projects/lab/designs/a.json': '{}',
      }),
    );
    expect(diagnostics).toEqual([]);
    expect(projects.map((p) => p.id)).toEqual(['lab']);
    const lab = projects[0]!;
    expect(lab.types.map((t) => t.file)).toEqual(['projects/lab/types/gallery.ts', 'projects/lab/types/studio.ts']);
    expect(lab.designs.map((d) => d.stem)).toEqual(['a', 'b']);
  });

  it('reports folders without project.ts and folders with invalid names', () => {
    const { projects, diagnostics } = discoverProjects(
      fakeGlobs({ 'projects/orphan/types/a.ts': {}, 'projects/Bad_Name/project.ts': {} }),
    );
    expect(projects).toEqual([]);
    expect(diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ['invalid-project-folder', 'error'],
      ['missing-project-file', 'error'],
    ]);
  });
});

describe('project selection', () => {
  const available = ['example-gallery', 'lab'];
  it('prefers the URL, then the environment, then example-gallery', () => {
    expect(selectProject(available, { query: 'lab', env: 'example-gallery' }).id).toBe('lab');
    expect(selectProject(available, { query: '', env: 'lab' }).id).toBe('lab');
    expect(selectProject(available, {}).id).toBe(DEFAULT_PROJECT_ID);
    expect(selectProject(['lab'], {}).id).toBeNull();
  });

  it('never silently falls back when the requested project does not exist', () => {
    const r = selectProject(available, { query: 'nope' });
    expect(r.id).toBeNull();
    expect(r.diagnostic).toMatchObject({ code: 'unknown-project', severity: 'error', id: 'unknown-project|project:nope' });
  });
});

describe('project activation', () => {
  it('activates a valid project with plain-data registries', async () => {
    const project = await labProject({
      'projects/lab/algorithms/a.ts': { default: defineGraphAlgorithm({ id: 'a', label: 'A', run: analysis }) },
    });
    expect(project.id).toBe('lab');
    expect(project.definition).toEqual({ name: 'Lab' });
    expect(project.nodeTypes.map((t) => [t.id, t.status.ok])).toEqual([
      ['gallery', true],
      ['studio', true],
    ]);
    expect(project.nodeTypes[0]!.definition).toBe(galleryType); // the student's own object
    expect(project.algorithms.map((a) => [a.id, a.definition.scope, a.status.ok])).toEqual([['a', 'graph', true]]);
    expect(project.diagnostics).toEqual([]);
  });

  it('fails activation (with a conspicuous error) for an invalid or missing project definition', async () => {
    for (const value of [{ default: { title: 'x' } }, { notDefault: 1 }, LOAD_FAILS]) {
      const { activation } = await activate(fakeGlobs({ ...LAB_FILES, 'projects/lab/project.ts': value }), { query: 'lab' });
      expect(activation.status).toBe('failed');
      if (activation.status !== 'failed') continue;
      expect(activation.diagnostics[0]!.severity).toBe('error');
      expect(['invalid-project-definition', 'missing-default-export', 'module-load-failed']).toContain(activation.diagnostics[0]!.code);
    }
  });

  it('disables invalid node types but keeps them registered as broken (no silent fallback)', async () => {
    const broken = { id: 'gallery', label: 'Gallery', facade: { windowFraction: 1.5 }, colour: '#fff' };
    const project = await labProject({ 'projects/lab/types/gallery.ts': { default: broken } });
    const gallery = project.nodeTypes.find((t) => t.id === 'gallery')!;
    expect(gallery.status.ok).toBe(false);
    const d = project.diagnostics.find((x) => x.code === 'invalid-node-type')!;
    expect(d.severity).toBe('error');
    expect(d.message).toContain('windowFraction must be between 0 and 1');
    expect(d.message).toContain('colour'); // unknown field reported, not ignored
    expect(d.message).toContain('disabled');
    expect(project.nodeTypes.find((t) => t.id === 'studio')!.status.ok).toBe(true);
  });

  it.each([
    ['enum default not in values', { daylight: { kind: 'enum', values: ['a'], default: 'b' } }],
    ['duplicate enum values', { daylight: { kind: 'enum', values: ['a', 'a'] } }],
    ['min greater than max', { n: { kind: 'number', min: 2, max: 1 } }],
    ['default outside range', { n: { kind: 'number', min: 0, default: -1 } }],
    ['unknown kind', { n: { kind: 'colour' } }],
    ['unsupported option', { n: { kind: 'number', required: true } }],
  ])('rejects attribute definitions with %s', async (_name, attributes) => {
    const project = await labProject({ 'projects/lab/types/gallery.ts': { default: { id: 'gallery', label: 'G', attributes } } });
    expect(project.nodeTypes.find((t) => t.id === 'gallery')!.status.ok).toBe(false);
  });

  it('reports a type file whose id cannot be read, and files that fail to load', async () => {
    const project = await labProject({
      'projects/lab/types/x.ts': { default: { label: 'no id' } },
      'projects/lab/types/y.ts': LOAD_FAILS,
    });
    expect(project.nodeTypes.map((t) => t.id)).toEqual(['gallery', 'studio']);
    expect(project.diagnostics.map((d) => d.code).sort()).toEqual(['invalid-node-type', 'module-load-failed']);
  });

  it('disables every definition sharing an id and names both files', async () => {
    const copy = defineNodeType({ id: 'studio', label: 'Studio again' });
    const project = await labProject({
      'projects/lab/types/studio-2.ts': { default: copy },
      'projects/lab/algorithms/a.ts': { default: defineGraphAlgorithm({ id: 'dup', label: 'A', run: analysis }) },
      'projects/lab/algorithms/b.ts': { default: defineGraphAlgorithm({ id: 'dup', label: 'B', run: analysis }) },
    });
    const studios = project.nodeTypes.filter((t) => t.id === 'studio');
    expect(studios.map((t) => t.status.ok)).toEqual([false, false]);
    const dupType = project.diagnostics.filter((d) => d.code === 'duplicate-node-type');
    expect(dupType).toHaveLength(2);
    expect(dupType[0]!.message).toContain('projects/lab/types/studio-2.ts');
    expect(project.algorithms.map((a) => a.status.ok)).toEqual([false, false]);
    expect(project.diagnostics.filter((d) => d.code === 'duplicate-algorithm')).toHaveLength(2);
  });

  it('rejects algorithms that were not created with a define helper', async () => {
    const project = await labProject({ 'projects/lab/algorithms/a.ts': { default: { id: 'a', label: 'A', run: analysis } } });
    expect(project.algorithms[0]!.status.ok).toBe(false);
    expect(project.diagnostics[0]!.message).toContain('defineGraphAlgorithm');
  });

  it('registers invalid designs as unloadable with an error', async () => {
    const project = await labProject({
      'projects/lab/designs/good.json': serializeDesign(builtIn.doc),
      'projects/lab/designs/bad.json': '{ nope',
    });
    expect(project.designs.map((d) => [d.id, d.result.ok])).toEqual([
      ['bad', false],
      ['good', true],
    ]);
    expect(project.diagnostics.map((d) => d.code)).toEqual(['invalid-design']);
  });

  it('reports a missing or invalid defaultDesign', async () => {
    const missing = await labProject({ 'projects/lab/project.ts': { default: defineProject({ name: 'Lab', defaultDesign: 'nope' }) } });
    expect(missing.diagnostics.map((d) => d.code)).toEqual(['default-design-missing']);
    const invalid = await labProject({
      'projects/lab/project.ts': { default: defineProject({ name: 'Lab', defaultDesign: 'bad' }) },
      'projects/lab/designs/bad.json': '{}',
    });
    expect(invalid.diagnostics.map((d) => d.code)).toEqual(['invalid-design', 'default-design-invalid']);
  });

  it('returns status none when no project exists and none was requested', async () => {
    expect((await activate(fakeGlobs({}), {})).activation).toEqual({ status: 'none' });
  });

  it('activateProject never throws for a module that fails to load', async () => {
    const { projects } = discoverProjects(fakeGlobs({ 'projects/lab/project.ts': LOAD_FAILS }));
    const a = await activateProject(projects[0]!);
    expect(a.status).toBe('failed');
  });

});

describe('startup design and fallback', () => {
  const active = async (files: Readonly<Record<string, unknown>>): Promise<Activation> =>
    (await activate(fakeGlobs({ ...LAB_FILES, ...files }), { query: 'lab' })).activation;

  it('no project → built-in example, no diagnostics', () => {
    expect(resolveStartupDesign({ status: 'none' }, builtIn)).toEqual({ ...builtIn, diagnostics: [] });
  });

  it('failed activation → built-in example plus persistent diagnostics', async () => {
    const { activation } = await activate(fakeGlobs(LAB_FILES), { query: 'missing-project' });
    const start = resolveStartupDesign(activation, builtIn);
    expect(start.doc).toBe(builtIn.doc);
    expect(start.diagnostics.map((d) => d.code)).toEqual(['unknown-project']);
  });

  it('active project without defaultDesign → built-in example', async () => {
    expect(resolveStartupDesign(await active({}), builtIn).doc).toBe(builtIn.doc);
  });

  it('active project with a valid defaultDesign → that design', async () => {
    const start = resolveStartupDesign(
      await active({
        'projects/lab/project.ts': { default: defineProject({ name: 'Lab', defaultDesign: 'mine' }) },
        'projects/lab/designs/mine.json': serializeDesign({ ...builtIn.doc, metadata: { name: 'Mine' } }),
      }),
      builtIn,
    );
    expect(start.doc?.metadata.name).toBe('Mine');
    expect(start.source).toBe('projects/lab/designs/mine.json');
  });

  it('active project with a broken defaultDesign → nothing loaded, with the error', async () => {
    const start = resolveStartupDesign(
      await active({ 'projects/lab/project.ts': { default: defineProject({ name: 'Lab', defaultDesign: 'gone' }) } }),
      builtIn,
    );
    expect(start.doc).toBeNull();
    expect(start.diagnostics.map((d) => d.code)).toEqual(['default-design-missing']);
  });
});
