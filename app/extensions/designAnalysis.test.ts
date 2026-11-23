import { describe, expect, it } from 'vitest';
import * as studentApi from '@student-api';
import { readDesignJson } from '@app/document';
import { expectOk } from '@app/document/test-fixtures';
import { activate, type ActiveToolkit } from './activate';
import { functionInfos, missingUses } from './context';
import { algorithmDefinitionSchema } from './definitions';
import { runAlgorithmV2 } from './run';
import { GALLERY_FILES, TWO_STOREY_TEXT } from './test-toolkit';
import { expectDiagnostic, expectExtOk, fakeGlobs } from './test-fixtures';
import { prepareUpload, runUploadedAnalysis, type UploadRunner, type UploadStatus } from './uploadedAnalyses';
import { handleUploadRequest } from './uploadSandbox';
import { compileUpload } from './uploadSource';

/**
 * Design analyses (owner 2026-11-20): the same file works as a toolkit analysis and as an upload,
 * reads Function, position, size, calculated values and ONLY the custom fields it lists in `uses`,
 * and is refused with a plain reason where the project lacks what it uses.
 */

const inProcess: UploadRunner = async (request) => structuredClone(handleUploadRequest(structuredClone(request)));
const doc = () => expectOk(readDesignJson(TWO_STOREY_TEXT)).doc;

/** Public galleries: counts them, lights them up, colours every room by its area, and reports what it saw. */
const SOURCE = `import { defineDesignAnalysis } from '@student-api';

export default defineDesignAnalysis({
  id: 'public-galleries',
  label: 'Public galleries',
  description: 'Counts the galleries open to the public.',
  inputs: [],
  uses: { functions: ['gallery'], nodeFields: ['public'] },
  run(ctx) {
    const rooms = ctx.design.nodes;
    // Galleries whose "public" field is true.
    const hits = rooms.filter((r) => r.function === 'gallery' && r.custom.public === true).map((r) => r.id);
    // Every room's floor area, from the app's calculated values.
    const nodeValues: Record<number, number> = {};
    for (const r of rooms) nodeValues[r.id] = ctx.metrics.value('area', r.id) as number;
    const seen = [
      'keys=' + Object.keys(rooms[0].custom).join(','),
      'touches12=' + ctx.touches(1, 2),
      'touches14=' + ctx.touches(1, 4),
      'at=' + ctx.nodeAt([1, 1, 0]),
      'functions=' + ctx.functions.map((f) => f.id).join(','),
      'fields=' + ctx.customFields.nodes.map((f) => f.key + ':' + f.kind).join(','),
    ].join(' ');
    return { kind: 'analysis', value: hits.length, text: seen, highlightNodes: hits, nodeValues };
  },
});
`;

const EXPECTED = {
  kind: 'analysis',
  value: 3,
  text: 'keys=public touches12=true touches14=false at=4 functions=gallery,storage,studio fields=public:boolean',
  highlightNodes: [1, 3, 6],
  nodeValues: { 1: 9, 2: 9, 3: 9, 4: 9, 5: 9, 6: 9 },
};

/** The source evaluated as a module (the toolkit path imports the same file as code). */
async function definitionFrom(source: string): Promise<unknown> {
  const compiled = await compileUpload(source, 'public-galleries.ts');
  if (!compiled.ok) throw new Error(compiled.problems.join(' | '));
  const module: { exports: Record<string, unknown> } = { exports: {} };
  new Function('require', 'exports', 'module', compiled.code)(() => studentApi, module.exports, module);
  return module.exports.default;
}

async function toolkitWith(definition: unknown): Promise<ActiveToolkit> {
  const { activation } = await activate(fakeGlobs({ ...GALLERY_FILES, 'toolkits/gallery/algorithms/public-galleries.ts': { default: definition } }), { query: 'gallery' });
  if (activation.status !== 'active') throw new Error('test toolkit did not activate');
  return activation.toolkit;
}

const prepared = async (source: string): Promise<Extract<UploadStatus, { ok: true }>> => {
  const status = await prepareUpload(source, 'public-galleries.ts', inProcess);
  if (!status.ok) throw new Error(status.problems.join(' | '));
  return status;
};

describe('design analyses', () => {
  it('validate like graph analyses, plus an optional strict `uses`', () => {
    const base = { scope: 'design', id: 'x', label: 'X', inputs: [], run: () => undefined };
    expect(algorithmDefinitionSchema.safeParse(base).success).toBe(true);
    expect(algorithmDefinitionSchema.safeParse({ ...base, uses: { functions: ['bedroom'], nodeFields: ['targetArea'], edgeFields: [] } }).success).toBe(true);
    expect(algorithmDefinitionSchema.safeParse({ ...base, uses: { rooms: ['x'] } }).success).toBe(false);
    expect(algorithmDefinitionSchema.safeParse({ ...base, uses: { functions: ['Not An Id'] } }).success).toBe(false);
    expect(algorithmDefinitionSchema.safeParse({ ...base, inputs: undefined }).success).toBe(false);
    expect(algorithmDefinitionSchema.safeParse({ ...base, parameters: {} }).success).toBe(false);
  });

  it('give the same validated answer as a toolkit analysis and as an upload', async () => {
    const project = await toolkitWith(await definitionFrom(SOURCE));
    expect(project.algorithms.find((a) => a.id === 'public-galleries')?.status.ok).toBe(true);
    const viaToolkit = expectExtOk(runAlgorithmV2(doc(), project, 'public-galleries'));
    expect(viaToolkit).toEqual({ kind: 'analysis', result: EXPECTED });

    const status = await prepared(SOURCE);
    expect(status.definition).toEqual({
      scope: 'design',
      id: 'public-galleries',
      label: 'Public galleries',
      description: 'Counts the galleries open to the public.',
      inputs: [],
      uses: { functions: ['gallery'], nodeFields: ['public'] },
    });
    const schema = project.attributeBaseline!.schema;
    const viaUpload = await runUploadedAnalysis(status, 'public-galleries.ts', doc(), [], inProcess, { doc: doc(), functions: functionInfos(project), schema });
    expect(viaUpload).toEqual({ ok: true, result: EXPECTED });
  });

  it('see only the custom fields they list (with defaults applied), never the others', async () => {
    const peek = SOURCE.replace("nodeFields: ['public']", "nodeFields: ['public', 'occupancy']");
    const project = await toolkitWith(await definitionFrom(peek));
    const { result } = expectExtOk(runAlgorithmV2(doc(), project, 'public-galleries')) as { result: { text: string } };
    // Room 1 (a gallery) has no occupancy value: only the listed fields that have a value are present.
    expect(result.text).toContain('keys=public ');
    expect(result.text).toContain('fields=public:boolean,occupancy:number');
  });

  it('are refused with a plain reason where the project lacks a Function or field they use', async () => {
    const needsCafe = SOURCE.replace("functions: ['gallery']", "functions: ['gallery', 'cafe']").replace("nodeFields: ['public']", "nodeFields: ['public', 'seats']");
    const project = await toolkitWith(await definitionFrom(needsCafe));
    const refused = expectDiagnostic(runAlgorithmV2(doc(), project, 'public-galleries'), 'missing-requirement');
    expect(refused.message).toBe('Needs the Function “cafe”, which this project does not have.');

    const schema = project.attributeBaseline!.schema;
    expect(missingUses({ functions: ['gallery', 'cafe', 'bar'], nodeFields: ['seats'], edgeFields: ['width'] }, functionInfos(project), schema)).toEqual([
      'Needs the Functions “cafe” and “bar”, which this project does not have.',
      'Needs the node field “seats”, which this project does not have.',
      'Needs the edge field “width”, which this project does not have.',
    ]);
    expect(missingUses(undefined, [], schema)).toEqual([]);

    const status = await prepared(needsCafe);
    const viaUpload = await runUploadedAnalysis(status, 'public-galleries.ts', doc(), [], inProcess, { doc: doc(), functions: functionInfos(project), schema });
    expect(viaUpload).toEqual({
      ok: false,
      messages: ['Needs the Function “cafe”, which this project does not have.', 'Needs the node field “seats”, which this project does not have.'],
    });
  });

  it('an analysis that uses nothing project-specific runs in a project without a toolkit', async () => {
    const anywhere = SOURCE.replace("uses: { functions: ['gallery'], nodeFields: ['public'] },", '').replace("r.function === 'gallery' && r.custom.public === true", 'r.size[2] === 1');
    const status = await prepared(anywhere);
    expect(status.definition.uses).toBeUndefined();
    const result = await runUploadedAnalysis(status, 'any.ts', doc(), [], inProcess, { doc: doc(), functions: [], schema: { nodes: [], edges: [], functionDefaults: {} } });
    expect(result).toMatchObject({ ok: true, result: { value: 6, text: expect.stringContaining('keys= ') } });
  });

  it('an uploaded design analysis reports an unknown calculated value plainly', async () => {
    const wrong = SOURCE.replace("ctx.metrics.value('area', r.id)", "ctx.metrics.value('floor-area', r.id)");
    const project = await toolkitWith(await definitionFrom(SOURCE));
    const status = await prepared(wrong);
    const result = await runUploadedAnalysis(status, 'x.ts', doc(), [], inProcess, { doc: doc(), functions: functionInfos(project), schema: project.attributeBaseline!.schema });
    expect(result).toEqual({ ok: false, messages: ['metrics.value: there is no calculated value "floor-area" (see ctx.metrics.list())'] });
  });
});
