import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readDesignJson, roomCells, type DesignDocumentV2 } from '@app/document';
import { expectOk } from '@app/document/test-fixtures';
import * as studentApi from '@student-api';
// The template, as CODE (the toolkit path) and as TEXT (the upload path): the same file.
import template from '../../docs/templates/transform-template';
import templateSource from '../../docs/templates/transform-template.ts?raw';
import growSource from '../../docs/ai-kit/transform/examples/grow-in-one-direction.ts?raw';
import prioritySource from '../../docs/ai-kit/transform/examples/priority-from-missing-area.ts?raw';
import houseGraphOnly from '../document/examples/house.json';
import { activateToolkit, projectOnlyToolkit, type ActiveToolkit } from './activate';
import { buildSpatialContextV2 } from './context';
import { tableMetricReader } from './designAnalysisContext';
import { discoverToolkits } from './discover';
import { withProjectFunctions } from './projectFunctions';
import { runAlgorithmV2 } from './run';
import { expectExtOk } from './test-fixtures';
import { TOOLKIT_GLOBS } from './toolkitGlobs';
import { CUSTOM_OF_REFUSAL, uploadedTransformContext } from './transformContext';
import { prepareUpload, timeoutMessage, UPLOAD_TIMEOUT_MS, workerRunner, type UploadRunner, type WorkerLike } from './uploadedAnalyses';
import { buildTransformRunData, prepareTransformUpload, runUploadedTransform, type TransformUploadStatus } from './uploadedTransforms';
import { ANALYSIS_REFUSAL, handleUploadRequest, SPATIAL_REFUSAL } from './uploadSandbox';
import { compileUpload } from './uploadSource';

/**
 * Uploaded transforms (owner 2026-11-25): one upload engine for both surfaces, a worker context
 * built from plain data that answers exactly like the toolkit context, and a main thread that
 * validates and applies the result exactly like a toolkit transform (same preview).
 */

/** The worker's own code, run in-process (Vitest has no Web Workers); messages are structured-cloned as they would be. */
const inProcess: UploadRunner = async (request) => structuredClone(handleUploadRequest(structuredClone(request)));

let house: ActiveToolkit;
let simpleHouse: DesignDocumentV2;
let gardenHouse: DesignDocumentV2;
beforeAll(async () => {
  const source = discoverToolkits(TOOLKIT_GLOBS).toolkits.find((t) => t.id === 'house')!;
  const activation = await activateToolkit(source);
  if (activation.status !== 'active') throw new Error('toolkits/house did not activate');
  house = activation.toolkit;
  const design = (id: string) => {
    const result = house.designs.find((d) => d.id === id)!.result;
    if (!result.ok) throw new Error(`${id} is invalid`);
    return result.value;
  };
  simpleHouse = design('simple-house');
  gardenHouse = design('garden-house');
});

const prepared = async (source: string, fileName = 'mine.ts'): Promise<Extract<TransformUploadStatus, { ok: true }>> => {
  const status = await prepareTransformUpload(source, fileName, inProcess);
  if (!status.ok) throw new Error(`expected the transform to load: ${status.problems.join(' | ')}`);
  return status;
};
const problemsOf = async (source: string, fileName = 'mine.ts') => {
  const status = await prepareTransformUpload(source, fileName, inProcess);
  if (status.ok) throw new Error('expected the upload to be refused');
  return status.problems;
};

/** A small transform whose `run` body is `body`, with optional extra definition fields. */
const transform = (body: string, extra = '') => `import { defineSpatialAlgorithm, getNode } from '@student-api';
export default defineSpatialAlgorithm({
  id: 'mine',
  label: 'Mine',${extra}
  run(ctx) {
${body}
  },
});
`;

/** The same compiled file evaluated with the REAL Student API: what the toolkit path would register. */
async function asToolkitCode(source: string): Promise<studentApi.SpatialAlgorithm> {
  const compiled = await compileUpload(source, 'x.ts', 'transform');
  if (!compiled.ok) throw new Error(compiled.problems.join());
  const module: { exports: Record<string, unknown> } = { exports: {} };
  new Function('require', 'exports', 'module', compiled.code)(() => studentApi, module.exports, module);
  return module.exports.default as studentApi.SpatialAlgorithm;
}

/** `project` with `algorithm` registered as one of its toolkit transforms. */
const withAlgorithm = (project: ActiveToolkit, algorithm: studentApi.SpatialAlgorithm): ActiveToolkit => ({
  ...project,
  algorithms: [...project.algorithms, { id: algorithm.id, file: `toolkits/${project.id}/algorithms/${algorithm.id}.ts`, definition: algorithm, status: { ok: true } }],
});

describe('loading an uploaded transform', () => {
  it('returns its definition data, parameters included, validated like a toolkit transform', async () => {
    const status = await prepared(templateSource, 'transform-template.ts');
    expect(status.definition).toEqual({
      id: 'connect-touching-rooms',
      label: 'Connect touching rooms',
      parameters: {
        relationship: {
          kind: 'enum',
          values: ['access', 'open'],
          default: 'access',
          label: 'Relationship',
          description: 'Access: people can pass (a door). Open: no wall between the two rooms.',
        },
      },
    });
    const noParameters = await prepared(transform("    return { kind: 'transformation', operations: [] };"));
    expect(noParameters.definition.parameters).toEqual({});
  });

  it('refuses a broken definition with the toolkit messages', async () => {
    expect((await problemsOf(transform("    return { kind: 'transformation', operations: [] };").replace("id: 'mine'", "id: 'Not An Id'")))[0]).toMatch(/^id/);
    expect((await problemsOf(transform("    return { kind: 'transformation', operations: [] };", "\n  inputs: [],")))[0]).toContain('inputs are for analyses');
    expect((await problemsOf(transform("    return { kind: 'transformation', operations: [] };", "\n  parameters: { n: { kind: 'number', min: 5, max: 1 } },")))[0]).toContain('min (5) is greater than max (1)');
    expect((await problemsOf("export const x = 1;\n"))[0]).toContain('export default defineSpatialAlgorithm');
    expect((await problemsOf("import fs from 'fs';\nexport default 1;\n"))[0]).toBe('This file imports "fs". Uploaded transforms may import only "@student-api".');
    expect((await problemsOf('x', 'notes.txt'))[0]).toBe('"notes.txt" is not a .ts or .js file. Upload the transform as a .ts file.');
  });
});

describe('the upload surface decides what is accepted (one engine)', () => {
  it('Analyse refuses a transform and points to Transform', async () => {
    const status = await prepareUpload(templateSource, 'transform-template.ts', inProcess);
    expect(status).toEqual({ ok: false, problems: [SPATIAL_REFUSAL] });
    expect(SPATIAL_REFUSAL).toContain('upload it in Transform › Upload your own (.ts)');
  });

  it('Transform refuses an analysis (graph or design) and points to Analyse', async () => {
    const graph = "import { defineGraphAlgorithm } from '@student-api';\nexport default defineGraphAlgorithm({ id: 'g', label: 'G', inputs: [], run: () => ({ kind: 'analysis', value: 1 }) });\n";
    const design = "import { defineDesignAnalysis } from '@student-api';\nexport default defineDesignAnalysis({ id: 'd', label: 'D', inputs: [], run: () => ({ kind: 'analysis', value: 1 }) });\n";
    expect(await problemsOf(graph)).toEqual([ANALYSIS_REFUSAL]);
    expect(await problemsOf(design)).toEqual([ANALYSIS_REFUSAL]);
    expect(ANALYSIS_REFUSAL).toContain('upload it in Analyse › Upload your own (.ts)');
  });

  it('both surfaces still refuse defineToolkit and defineFunction', async () => {
    expect((await problemsOf("import { defineToolkit } from '@student-api';\nexport default defineToolkit({ name: 'x' });\n"))[0]).toContain('a toolkit lives in a toolkit folder');
    expect((await problemsOf("import { defineFunction } from '@student-api';\nexport default defineFunction({ id: 'x', label: 'X' });\n"))[0]).toContain('Functions live in a toolkit folder');
  });

  it('a transform run request never runs an analysis', async () => {
    const graph = await compileUpload("import { defineGraphAlgorithm } from '@student-api';\nexport default defineGraphAlgorithm({ id: 'g', label: 'G', inputs: [], run: () => ({ kind: 'analysis', value: 1 }) });\n", 'g.ts');
    if (!graph.ok) throw new Error('did not compile');
    const reply = handleUploadRequest({ op: 'transform', code: graph.code, fileName: 'g.ts', data: buildTransformRunData(simpleHouse, house.attributeBaseline.schema), params: {} });
    expect(reply).toEqual({ ok: false, message: ANALYSIS_REFUSAL });
  });
});

describe('the worker context answers exactly like the toolkit context', () => {
  const compare = (doc: DesignDocumentV2, project: ActiveToolkit) => {
    const schema = project.attributeBaseline.schema;
    const params = { n: 3 };
    const toolkit = buildSpatialContextV2(doc, project, 'x', params, schema);
    const data = structuredClone(buildTransformRunData(doc, schema)); // as it crosses to the worker
    const fail = (message: string) => new Error(message);
    const worker = uploadedTransformContext(data, params, tableMetricReader(data.metrics, (_code, message) => fail(message)), fail);

    expect(worker.design).toEqual(toolkit.design);
    expect(worker.params).toEqual(toolkit.params);
    expect(worker.customFields).toEqual(toolkit.customFields);
    expect(Object.isFrozen(worker.design.nodes[0])).toBe(true);

    const threw = (f: () => unknown): string => {
      try {
        f();
        return 'no error';
      } catch (error) {
        return (error as Error).message;
      }
    };
    const ids = [...doc.nodes.map((n) => n.id), 999, -1, 1.5];
    for (const id of ids) {
      if (doc.nodes.some((n) => n.id === id)) expect(worker.nodeCustom(id), `node ${id}`).toEqual(toolkit.nodeCustom(id));
      else expect(threw(() => worker.nodeCustom(id))).toBe(threw(() => toolkit.nodeCustom(id)));
    }
    for (const id of [...doc.edges.map((e) => e.id), 999]) {
      if (doc.edges.some((e) => e.id === id)) expect(worker.edgeCustom(id), `edge ${id}`).toEqual(toolkit.edgeCustom(id));
      else expect(threw(() => worker.edgeCustom(id))).toBe(threw(() => toolkit.edgeCustom(id)));
    }
    for (const a of ids) {
      for (const b of ids) {
        expect(worker.touches(a, b), `touches(${a}, ${b})`).toBe(toolkit.touches(a, b));
        expect(worker.canRelate(a, b), `canRelate(${a}, ${b})`).toBe(toolkit.canRelate(a, b));
      }
    }
    // Every cell around the design, and some that are not cells.
    const cells = doc.nodes.flatMap((n) => roomCells(n));
    const lo = [0, 1, 2].map((k) => Math.min(...cells.map((c) => c[k]!)) - 1);
    const hi = [0, 1, 2].map((k) => Math.max(...cells.map((c) => c[k]!)) + 1);
    for (let x = lo[0]!; x <= hi[0]!; x++)
      for (let y = lo[1]!; y <= hi[1]!; y++)
        for (let z = lo[2]!; z <= hi[2]!; z++) expect(worker.nodeAt([x, y, z]), `nodeAt(${x},${y},${z})`).toBe(toolkit.nodeAt([x, y, z]));
    for (const odd of [[0.5, 0, 0], [0, 0], 'x', null] as unknown as studentApi.GridCoord[]) expect(worker.nodeAt(odd)).toBe(toolkit.nodeAt(odd));

    expect(worker.metrics.list()).toEqual(toolkit.metrics.list());
    for (const m of toolkit.metrics.list()) {
      const items = m.collection === 'nodes' ? doc.nodes.map((n) => n.id) : doc.edges.map((e) => e.id);
      for (const id of [...items, 999]) {
        if (items.includes(id)) expect(worker.metrics.value(m.id, id), `${m.id} of ${id}`).toEqual(toolkit.metrics.value(m.id, id));
        else expect(threw(() => worker.metrics.value(m.id, id))).toBe(threw(() => toolkit.metrics.value(m.id, id)));
      }
    }
    expect(threw(() => worker.metrics.value('no-such-metric', 1))).toBe(threw(() => toolkit.metrics.value('no-such-metric', 1)));
  };

  it('on the House toolkit’s Simple house', () => compare(simpleHouse, house));
  it('on the House toolkit’s Garden house (more rooms, corridors, levels)', () => compare(gardenHouse, house));
  it('in a project without a toolkit', () => compare(expectOk(readDesignJson(JSON.stringify(houseGraphOnly))).doc, projectOnlyToolkit('p1')));

  it('refuses customOf with a readable message (no toolkit Functions in an upload)', async () => {
    const status = await prepared(transform('    ctx.customOf(ctx.design.nodes[0]!, {} as never);\n    return { kind: "transformation", operations: [] };'));
    const outcome = await runUploadedTransform(status, 'mine.ts', simpleHouse, house, {}, {}, inProcess);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.issues.map((d) => d.message)).toEqual([CUSTOM_OF_REFUSAL]);
    expect(CUSTOM_OF_REFUSAL).toContain('ctx.nodeCustom(nodeId)');
  });
});

describe('running an uploaded transform gives the same preview as a toolkit transform', () => {
  const both = async (source: string, doc: DesignDocumentV2, project: ActiveToolkit, params: Record<string, unknown> = {}) => {
    const status = await prepared(source);
    const uploaded = expectExtOk(await runUploadedTransform(status, 'mine.ts', doc, project, params, {}, inProcess));
    const code = await asToolkitCode(source);
    const viaToolkit = expectExtOk(runAlgorithmV2(doc, withAlgorithm(project, code), code.id, params));
    if (uploaded.kind !== 'transformation' || viaToolkit.kind !== 'transformation') throw new Error('expected transformations');
    return { uploaded: uploaded.preview, viaToolkit: viaToolkit.preview };
  };

  it('the template, on the Simple house, with each relationship', async () => {
    for (const relationship of ['access', 'open']) {
      const { uploaded, viaToolkit } = await both(templateSource, simpleHouse, house, { relationship });
      expect(uploaded).toEqual(viaToolkit);
      expect(uploaded.before).toBe(simpleHouse);
      expect(uploaded.operations).toEqual([{ op: 'add-edge', source: 1, target: 5, relationship }]);
      expect(uploaded.after.edges.at(-1)).toMatchObject({ id: 5, source: 1, target: 5, relationship });
    }
    // The template imported as code is the same transform as the text.
    expect(template.id).toBe('connect-touching-rooms');
    const viaImport = expectExtOk(runAlgorithmV2(simpleHouse, withAlgorithm(house, template), template.id, {}));
    const uploaded = expectExtOk(await runUploadedTransform(await prepared(templateSource), 'mine.ts', simpleHouse, house, {}, {}, inProcess));
    expect(uploaded).toEqual(viaImport);
  });

  it('a transform reading fields and calculated values (priority from missing area), on the Simple house', async () => {
    const { uploaded, viaToolkit } = await both(prioritySource, simpleHouse, house);
    expect(uploaded).toEqual(viaToolkit);
    expect(uploaded.summary).toBe('New priorities: room 2 → 1, room 3 → 2, room 4 → 3.');
  });

  it('a geometry transform reading nodeAt and touches (grow in one direction), on the Garden house', async () => {
    let grown = 0;
    for (const direction of ['+x', '-x', '+y', '-y']) {
      const { uploaded, viaToolkit } = await both(growSource, gardenHouse, house, { direction });
      expect(uploaded, direction).toEqual(viaToolkit);
      grown += uploaded.operations.length;
    }
    expect(grown).toBeGreaterThan(0);
  });
});

describe('the main thread checks everything again', () => {
  it('validates parameters before running (unknown, wrong kind, outside the choices)', async () => {
    const status = await prepared(templateSource);
    const run = (params: unknown) => runUploadedTransform(status, 'mine.ts', simpleHouse, house, params, {}, inProcess);
    const messages = async (params: unknown) => {
      const outcome = await run(params);
      return outcome.ok ? [] : outcome.issues.map((d) => d.message);
    };
    expect(await messages({ relationship: 'door' })).toEqual(['parameter "relationship" must be one of "access", "open", not "door"']);
    expect(await messages({ colour: 'red' })).toEqual(['unknown parameter "colour"']);
    expect((await run({})).ok).toBe(true);
  });

  it('an invalid operation or result becomes a readable message, and nothing is applied', async () => {
    const unknownFunction = await prepared(transform("    return { kind: 'transformation', operations: [{ op: 'add-node', position: [9, 9, 0], function: 'spaceship' }] };"));
    const a = await runUploadedTransform(unknownFunction, 'mine.ts', simpleHouse, house, {}, {}, inProcess);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.issues[0]!.message).toMatch(/spaceship/);

    const overlap = await prepared(transform("    return { kind: 'transformation', operations: [{ op: 'add-node', position: [0, 1, 0], function: 'kitchen' }] };"));
    const b = await runUploadedTransform(overlap, 'mine.ts', simpleHouse, house, {}, {}, inProcess);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.issues[0]!.code).toBe('occupied-cell');

    const notATransformation = await prepared(transform("    return { kind: 'analysis', value: 1 };"));
    const c = await runUploadedTransform(notATransformation, 'mine.ts', simpleHouse, house, {}, {}, inProcess);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.issues[0]!.message).toBe('algorithm "mine" returned an invalid result: spatial algorithms must return { kind: "transformation", operations }');

    const thrown = await prepared(transform("    const room: any = undefined;\n    return room.id;"));
    const d = await runUploadedTransform(thrown, 'mine.ts', simpleHouse, house, {}, {}, inProcess);
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.issues[0]!.message).toMatch(/^run failed \(line 7\): TypeError: /);
  });

  it('works in a project without a toolkit, adding a node of the project’s own Function', async () => {
    const doc = expectOk(readDesignJson(JSON.stringify(houseGraphOnly))).doc;
    const project = withProjectFunctions(projectOnlyToolkit('p1'), [{ id: 'studio', label: 'Studio' }]);
    const source = transform(
      "    const free = ctx.nodeAt([5, 5, 0]) === undefined;\n    return { kind: 'transformation', summary: 'one studio', operations: free ? [{ op: 'add-node', ref: 's', position: [5, 5, 0], function: 'studio' }, { op: 'add-edge', source: 1, target: 's', relationship: 'access' }] : [] };",
    );
    const outcome = expectExtOk(await runUploadedTransform(await prepared(source), 'mine.ts', doc, project, {}, {}, inProcess));
    if (outcome.kind !== 'transformation') throw new Error('expected a transformation');
    expect(outcome.preview.assigned.nodes).toEqual({ s: doc.nextNodeId });
    expect(outcome.preview.after.nodes.at(-1)).toMatchObject({ id: doc.nextNodeId, function: 'studio', position: [5, 5, 0] });
    // Without that project Function the same file is refused readably.
    const refused = await runUploadedTransform(await prepared(source), 'mine.ts', doc, projectOnlyToolkit('p1'), {}, {}, inProcess);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.issues[0]!.message).toMatch(/studio/);
  });

  it('reads calculated values from the table the main thread computed', async () => {
    const status = await prepared(transform("    return { kind: 'transformation', summary: String(ctx.metrics.value('area', 2)), operations: [] };"));
    const outcome = expectExtOk(await runUploadedTransform(status, 'mine.ts', simpleHouse, house, {}, {}, inProcess));
    expect(outcome.kind === 'transformation' && outcome.preview.summary).toBe('9');
  });
});

describe('the transform worker runner', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops a transform that does not answer in time, with a readable message', async () => {
    vi.useFakeTimers();
    const worker = { onmessage: null, onerror: null, postMessage: vi.fn(), terminate: vi.fn() } satisfies WorkerLike;
    const status = await prepared(templateSource);
    const outcome = runUploadedTransform(status, 'mine.ts', simpleHouse, house, {}, {}, workerRunner(() => worker, UPLOAD_TIMEOUT_MS, 'transform'));
    await vi.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS + 1);
    const result = await outcome;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((d) => d.message)).toEqual([timeoutMessage()]);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ op: 'transform', params: { relationship: 'access' } }));
  });

  it('names the transform in a worker error', async () => {
    const failing: WorkerLike = {
      onmessage: null,
      onerror: null,
      postMessage() {
        queueMicrotask(() => this.onerror?.({ message: 'script failed' }));
      },
      terminate: vi.fn(),
    };
    expect(await workerRunner(() => failing, UPLOAD_TIMEOUT_MS, 'transform')({ op: 'load', code: '', fileName: 'x.ts', surface: 'transform' })).toEqual({
      ok: false,
      message: 'The transform stopped with an error: script failed',
    });
  });

  it('the worker receives plain data only (no functions, no document object)', () => {
    const data = buildTransformRunData(simpleHouse, house.attributeBaseline.schema);
    expect(structuredClone(data)).toEqual(data);
    expect(data.design.nodes).not.toBe(simpleHouse.nodes);
    expect(data.design.nodes[0]).not.toBe(simpleHouse.nodes[0]);
    expect(Object.keys(data).sort()).toEqual(['customFields', 'design', 'edgeCustom', 'metrics', 'nodeCustom', 'occupied', 'related', 'touching']);
  });
});
