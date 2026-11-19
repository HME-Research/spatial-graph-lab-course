import { afterEach, describe, expect, it, vi } from 'vitest';
import { readDesignJson } from '@app/document';
import { expectOk } from '@app/document/test-fixtures';
// The student template, as CODE (the toolkit path) and as TEXT (the upload path): the same file.
import template from '../../docs/templates/graph-analysis-template';
import templateSource from '../../docs/templates/graph-analysis-template.ts?raw';
import { activate } from './activate';
import { runAlgorithmV2 } from './run';
import { GALLERY_FILES, TWO_STOREY_TEXT } from './test-toolkit';
import { expectExtOk, fakeGlobs } from './test-fixtures';
import {
  prepareUpload,
  runUploadedAnalysis,
  timeoutMessage,
  UPLOAD_TIMEOUT_MS,
  workerRunner,
  type UploadRunner,
  type UploadStatus,
  type WorkerLike,
} from './uploadedAnalyses';
import { handleUploadRequest, SPATIAL_REFUSAL } from './uploadSandbox';
import { compileUpload, importedModules, MAX_UPLOAD_BYTES, sourceProblems } from './uploadSource';

/** The worker's own code, run in-process (Vitest has no Web Workers); messages are structured-cloned as they would be. */
const inProcess: UploadRunner = async (request) => structuredClone(handleUploadRequest(structuredClone(request)));

const doc = () => expectOk(readDesignJson(TWO_STOREY_TEXT)).doc;

const prepared = async (source: string, fileName = 'mine.ts'): Promise<Extract<UploadStatus, { ok: true }>> => {
  const status = await prepareUpload(source, fileName, inProcess);
  if (!status.ok) throw new Error(`expected the upload to load: ${status.problems.join(' | ')}`);
  return status;
};
const problemsOf = async (source: string, fileName = 'mine.ts') => {
  const status = await prepareUpload(source, fileName, inProcess);
  if (status.ok) throw new Error('expected the upload to be refused');
  return status.problems;
};

/** A small analysis whose `run` body is `body` (one node input). */
const analysis = (body: string, extra = '') => `import { defineGraphAlgorithm, neighbours } from '@student-api';
export default defineGraphAlgorithm({
  id: 'mine',
  label: 'Mine',${extra}
  inputs: [{ kind: 'node', label: 'Node' }],
  run({ graph, inputs }) {
${body}
  },
});
`;

describe('the template works both as a toolkit analysis and as an upload', () => {
  it('imports only @student-api', () => {
    expect(importedModules(templateSource)).toEqual(['@student-api']);
    expect(sourceProblems(templateSource, 'graph-analysis-template.ts')).toEqual([]);
  });

  it('gives the same validated answer through both paths', async () => {
    const design = doc();
    const inputs = [1, 2];

    // Toolkit path: the file dropped into toolkits/<id>/algorithms/, activated and run as the app does.
    const { activation } = await activate(fakeGlobs({ ...GALLERY_FILES, 'toolkits/gallery/algorithms/exactly-k-steps.ts': { default: template } }), { query: 'gallery' });
    if (activation.status !== 'active') throw new Error('test toolkit did not activate');
    expect(activation.toolkit.algorithms.find((a) => a.id === 'exactly-k-steps')?.status.ok).toBe(true);
    const viaToolkit = expectExtOk(runAlgorithmV2(design, activation.toolkit, 'exactly-k-steps', undefined, { inputs }));
    if (viaToolkit.kind !== 'analysis') throw new Error('expected an analysis');

    // Upload path: the same text, types stripped, loaded and run in the (in-process) worker.
    const status = await prepared(templateSource, 'graph-analysis-template.ts');
    expect(status.definition).toEqual({
      id: 'exactly-k-steps',
      label: 'Exactly k steps away',
      description: template.description,
      inputs: [
        { kind: 'node', label: 'Start' },
        { kind: 'number', label: 'Steps', min: 1, max: 20, default: 2 },
      ],
    });
    const viaUpload = await runUploadedAnalysis(status, 'graph-analysis-template.ts', design, inputs, inProcess);
    expect(viaUpload).toEqual({ ok: true, result: viaToolkit.result });
    expect(viaToolkit.result.highlightNodes?.[0]).toBe(1);
  });
});

describe('uploaded source checks', () => {
  it('refuses any import other than @student-api, naming it', async () => {
    const fs = await problemsOf(`import { readFileSync } from 'fs';\n${analysis("    return { kind: 'analysis', value: 1 };")}`);
    expect(fs).toEqual(['This file imports "fs". Uploaded analyses may import only "@student-api".']);
    // Even an import used only as a type, and dynamic imports / require.
    expect(await problemsOf(`import type { X } from 'zod';\n${analysis("    return { kind: 'analysis', value: 1 };")}`)).toEqual([
      'This file imports "zod". Uploaded analyses may import only "@student-api".',
    ]);
    expect((await problemsOf(analysis("    const m = require('child_process'); return { kind: 'analysis', value: 1 };")))[0]).toContain('"child_process"');
    expect((await problemsOf(analysis("    void import('./helpers'); return { kind: 'analysis', value: 1 };")))[0]).toContain('must be a single file');
  });

  it('refuses other file types, empty files and files over the size limit', async () => {
    expect(await problemsOf('x', 'notes.txt')).toEqual(['"notes.txt" is not a .ts or .js file. Upload the analysis as a .ts file.']);
    expect(await problemsOf('  ', 'a.ts')).toEqual(['"a.ts" is empty.']);
    const big = `// ${'x'.repeat(MAX_UPLOAD_BYTES)}\n`;
    expect((await problemsOf(big))[0]).toMatch(/is 100.1 KB; an uploaded analysis may be at most 100 KB/);
  });

  it('reports syntax errors with the line', async () => {
    const compiled = await compileUpload("import { defineGraphAlgorithm } from '@student-api';\n\nconst x = ;\n", 'broken.ts');
    expect(compiled).toEqual({ ok: false, problems: ['Syntax error on line 3, column 11: Unexpected token'] });
  });

  it('accepts plain JavaScript (.js)', async () => {
    const js = "import { defineGraphAlgorithm } from '@student-api';\nexport default defineGraphAlgorithm({ id: 'count', label: 'Count', inputs: [], run: ({ graph }) => ({ kind: 'analysis', value: graph.nodes.length }) });\n";
    const status = await prepared(js, 'count.js');
    expect(await runUploadedAnalysis(status, 'count.js', doc(), [], inProcess)).toEqual({ ok: true, result: { kind: 'analysis', value: 6 } });
  });
});

describe('uploaded definitions', () => {
  it('refuses spatial algorithms with the agreed message', async () => {
    const spatial = "import { defineSpatialAlgorithm } from '@student-api';\nexport default defineSpatialAlgorithm({ id: 'grow', label: 'Grow', run: () => ({ kind: 'transformation', operations: [] }) });\n";
    expect(await problemsOf(spatial)).toEqual([SPATIAL_REFUSAL]);
    expect(SPATIAL_REFUSAL).toBe('Uploaded algorithms can only analyse the graph; transforms must live in a toolkit folder.');
  });

  it('validates the definition exactly like a toolkit analysis (strict fields, id, required inputs)', async () => {
    const noInputs = "import { defineGraphAlgorithm } from '@student-api';\nexport default defineGraphAlgorithm({ id: 'x', label: 'X', run: () => ({ kind: 'analysis', value: 1 }) });\n";
    expect((await problemsOf(noInputs)).join(' ')).toContain('inputs');
    const badId = analysis("    return { kind: 'analysis', value: 1 };").replace("id: 'mine'", "id: 'Not An Id'");
    expect((await problemsOf(badId)).join(' ')).toMatch(/^id/);
    const typo = analysis("    return { kind: 'analysis', value: 1 };", "\n  colour: 'red',");
    expect((await problemsOf(typo)).join(' ')).toContain('colour');
    const params = analysis("    return { kind: 'analysis', value: 1 };", '\n  parameters: {},');
    expect((await problemsOf(params)).join(' ')).toContain('graph analyses take no parameters');
  });

  it('keeps an optional description for the ⓘ', async () => {
    const status = await prepared(analysis("    return { kind: 'analysis', value: 1 };", "\n  description: 'Counts things.',"));
    expect(status.definition.description).toBe('Counts things.');
  });

  it('needs a default export made with defineGraphAlgorithm', async () => {
    expect((await problemsOf("export const x = 1;\n"))[0]).toContain('export default defineGraphAlgorithm');
    expect((await problemsOf("export default { id: 'x', label: 'X', inputs: [], run() {} };\n"))[0]).toContain('not a graph analysis');
  });

  it('offers only what an analysis needs from @student-api', async () => {
    const grid = "import { defineGraphAlgorithm, roomCells } from '@student-api';\nroomCells;\nexport default defineGraphAlgorithm({ id: 'x', label: 'X', inputs: [], run: () => ({ kind: 'analysis', value: 1 }) });\n";
    expect((await problemsOf(grid))[0]).toMatch(/^"roomCells" from @student-api is not available in an uploaded analysis/);
  });

  it('reports an exception while loading with its line', async () => {
    const problems = await problemsOf("import { defineGraphAlgorithm } from '@student-api';\n\nconst broken: any = undefined;\nbroken.field;\n");
    expect(problems[0]).toMatch(/^The file failed while loading \(line 4\): TypeError: /);
  });
});

describe('running an upload', () => {
  it('checks the picked inputs before running', async () => {
    const status = await prepared(analysis("    return { kind: 'analysis', value: neighbours(graph, inputs[0]!).length };"));
    expect(await runUploadedAnalysis(status, 'mine.ts', doc(), [99], inProcess)).toEqual({ ok: false, messages: ['Node: there is no node 99'] });
    expect(await runUploadedAnalysis(status, 'mine.ts', doc(), [1], inProcess)).toMatchObject({ ok: true, result: { kind: 'analysis' } });
  });

  it('refuses a bad result readably', async () => {
    const status = await prepared(analysis("    return { kind: 'analysis', highlightNodes: [inputs[0]!, 999] };"));
    const outcome = await runUploadedAnalysis(status, 'mine.ts', doc(), [1], inProcess);
    expect(outcome).toEqual({ ok: false, messages: ['highlightNodes refers to node 999, which does not exist'] });
    const shape = await prepared(analysis("    return { value: 3 };"));
    expect((await runUploadedAnalysis(shape, 'mine.ts', doc(), [1], inProcess)).ok).toBe(false);
    const fn = await prepared(analysis("    return { kind: 'analysis', value: 1, extra: () => 1 };"));
    expect(await runUploadedAnalysis(fn, 'mine.ts', doc(), [1], inProcess)).toEqual({
      ok: false,
      messages: ['The result may contain only plain data (numbers, text, lists, objects), not functions or class instances.'],
    });
  });

  it('reports a runtime exception with the line of the student file', async () => {
    const status = await prepared(analysis("    const missing: any = undefined;\n    return missing.value;"));
    const outcome = await runUploadedAnalysis(status, 'mine.ts', doc(), [1], inProcess);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.messages[0]).toMatch(/^run failed \(line 8\): TypeError: /);
  });

  it('gives the analysis ids and endpoints only, frozen', async () => {
    const status = await prepared(analysis("    const keys = Object.keys(graph.nodes[0]!).join(',') + '|' + Object.keys(graph.edges[0]!).join(',');\n    return { kind: 'analysis', text: keys + '|' + Object.isFrozen(graph.nodes) };"));
    expect(await runUploadedAnalysis(status, 'mine.ts', doc(), [1], inProcess)).toEqual({ ok: true, result: { kind: 'analysis', text: 'id|id,source,target|true' } });
  });
});

describe('the worker runner', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A worker that never answers (an endless loop) and records termination. */
  const silentWorker = () => {
    const worker = { onmessage: null, onerror: null, postMessage: vi.fn(), terminate: vi.fn() } satisfies WorkerLike;
    return worker;
  };

  it('stops a worker that does not answer in time, with a readable message', async () => {
    vi.useFakeTimers();
    const worker = silentWorker();
    const reply = workerRunner(() => worker)({ op: 'load', code: '', fileName: 'loop.ts' });
    await vi.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS + 1);
    expect(await reply).toEqual({ ok: false, message: 'Stopped after 3 s — does it loop forever?' });
    expect(timeoutMessage()).toBe('Stopped after 3 s — does it loop forever?');
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('terminates the worker after its reply, and turns a worker error into a message', async () => {
    const answering: WorkerLike = {
      onmessage: null,
      onerror: null,
      postMessage(message) {
        queueMicrotask(() => this.onmessage?.({ data: handleUploadRequest(message as never) }));
      },
      terminate: vi.fn(),
    };
    const status = await prepareUpload(templateSource, 'graph-analysis-template.ts', workerRunner(() => answering));
    expect(status.ok).toBe(true);
    expect(answering.terminate).toHaveBeenCalledTimes(1);

    const failing: WorkerLike = {
      onmessage: null,
      onerror: null,
      postMessage() {
        queueMicrotask(() => this.onerror?.({ message: 'script failed' }));
      },
      terminate: vi.fn(),
    };
    expect(await workerRunner(() => failing)({ op: 'load', code: '', fileName: 'x.ts' })).toEqual({ ok: false, message: 'The analysis stopped with an error: script failed' });
    expect(failing.terminate).toHaveBeenCalledTimes(1);
  });
});
