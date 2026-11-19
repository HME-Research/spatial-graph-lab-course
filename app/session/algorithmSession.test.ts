import { beforeAll, describe, expect, it } from 'vitest';
import { resolveFaces } from '@app/building';
import { applyGraphCommand, parseDesignJson, serializeDesign, validateDocument, type DesignDocument } from '@app/document';
import { expectOk } from '@app/document/test-fixtures';
import { type ActiveToolkit } from '@app/extensions';
import { galleryToolkit } from '@app/extensions/test-toolkit';
import { labDoc, labToolkit } from '@app/extensions/test-fixtures';
import { metricsLabDoc } from '@app/metrics/test-fixtures';
import { resolveWithPreferences } from '@app/spatial';
import builtInText from '../document/examples/two-storey-example.json?raw';
import {
  analysisRows,
  applyPreview,
  describePreview,
  draftsToParameters,
  isStale,
  listAlgorithms,
  parameterProblems,
  runEntry,
  runEntryV2,
  type AlgorithmEntry,
  type AlgorithmRun,
} from './algorithmSession';
import type { DocumentVersion } from './documentSession';

// Definitions are plain objects: only app/extensions may import @student-api.
const numberAlgorithm = {
  id: 'grow',
  label: 'Grow',
  scope: 'spatial',
  parameters: {
    count: { kind: 'number', min: 1, max: 5, default: 1 },
    mode: { kind: 'enum', values: ['fast', 'slow'] },
    loud: { kind: 'boolean', default: false },
    note: { kind: 'text' },
  },
  run: () => ({ kind: 'transformation', operations: [] }),
};

let example: ActiveToolkit;
const builtIn = expectOk(parseDesignJson(builtInText));
/** A document shown at a revision (revision 1 unless given). */
const at = (doc: DesignDocument, revision = 1): DocumentVersion => ({ doc, revision });

beforeAll(async () => {
  example = await galleryToolkit();
});

const entry = (project: ActiveToolkit, id: string): AlgorithmEntry => listAlgorithms(project).find((a) => a.id === id)!;

function transformation(run: AlgorithmRun) {
  if (!run.outcome.ok || run.outcome.value.kind !== 'transformation') throw new Error(`expected a preview, got ${JSON.stringify(run.outcome)}`);
  return run.outcome.value.preview;
}

describe('algorithm list', () => {
  it('lists the example algorithms with their scope, all enabled', () => {
    expect(listAlgorithms(example).map((a) => [a.id, a.label, a.scope, a.enabled])).toEqual([
      ['access-depth', 'Access depth from a room', 'graph', true],
      ['connect-storage-to-galleries', 'Connect storage to neighbouring galleries', 'spatial', true],
      ['daylight-from-exposure', 'Daylight from exposed walls', 'spatial', true],
    ]);
    expect(listAlgorithms(null)).toEqual([]);
  });

  it('identifies disabled algorithms with the reason, and refuses to run them', async () => {
    const project = await labToolkit({
      'toolkits/lab/algorithms/no-scope.ts': { default: { id: 'no-scope', label: 'No scope', run: () => null } },
      'toolkits/lab/algorithms/one.ts': { default: { ...numberAlgorithm, id: 'twin' } },
      'toolkits/lab/algorithms/two.ts': { default: { ...numberAlgorithm, id: 'twin', label: 7 } },
    });
    const list = listAlgorithms(project);
    expect(list.map((a) => [a.id, a.enabled, a.scope])).toEqual([
      ['no-scope', false, 'unknown'],
      ['twin', false, 'spatial'],
      ['twin', false, 'spatial'],
    ]);
    expect(list[0]!.problems.join(' ')).toContain('scope');
    expect(list[1]!.problems.join(' ')).toContain('also defined in');
    expect(list[2]!.label).toBe('twin'); // a non-text label is not shown
    expect(list.every((a) => a.parameters.length === 0)).toBe(true);
    const run = runEntry(at(labDoc()), project, list[0]!, {});
    expect(run.outcome.ok).toBe(false);
    expect(!run.outcome.ok && run.outcome.issues.map((d) => d.code)).toEqual(['algorithm-disabled']);
  });
});

describe('algorithm parameters', () => {
  it('empty drafts mean defaults; drafts are converted by kind and checked by the runtime', async () => {
    const project = await labToolkit({ 'toolkits/lab/algorithms/grow.ts': { default: numberAlgorithm } });
    const grow = entry(project, 'grow');
    expect(grow.parameters.map(([k]) => k)).toEqual(['count', 'mode', 'loud', 'note']);
    expect(draftsToParameters(grow, {})).toEqual({});
    expect(parameterProblems(grow, {})).toEqual([]);
    expect(draftsToParameters(grow, { count: ' 3 ', mode: 'slow', loud: 'true', note: 'hi' })).toEqual({ count: 3, mode: 'slow', loud: true, note: 'hi' });
    expect(parameterProblems(grow, { count: '3', mode: 'slow', loud: 'false' })).toEqual([]);

    const messages = (drafts: Record<string, string>) => parameterProblems(grow, drafts).map((d) => d.message);
    expect(messages({ count: 'abc' })).toEqual(['parameter "count" must be a number from 1 to 5, not "abc"']);
    expect(messages({ count: '9' })).toEqual(['parameter "count" must be a number from 1 to 5, not 9']);
    expect(messages({ mode: 'medium' })[0]).toContain('one of "fast", "slow"');
    // Invalid parameters stop the run before the algorithm is called.
    const run = runEntry(at(labDoc()), project, grow, { count: '0' });
    expect(!run.outcome.ok && run.outcome.issues.map((d) => d.code)).toEqual(['invalid-parameter']);
  });
});

describe('generic analysis results', () => {
  it('shows the summary and node values and does not modify the document', () => {
    const before = serializeDesign(builtIn);
    const run = runEntry(at(builtIn), example, entry(example, 'access-depth'), { start: 'store' });
    expect(serializeDesign(builtIn)).toBe(before);
    if (!run.outcome.ok || run.outcome.value.kind !== 'analysis') throw new Error('expected an analysis');
    const { result } = run.outcome.value;
    expect(result.summary).toBe('0 room(s) cannot be reached from "store".');
    expect(analysisRows(result.nodeValues, run.doc, builtIn)).toEqual([
      { nodeId: 'entry-gallery', value: 2, exists: true },
      { nodeId: 'studio-ground', value: 1, exists: true },
      { nodeId: 'reading-gallery', value: 3, exists: true },
      { nodeId: 'store', value: 0, exists: true },
      { nodeId: 'studio-upper', value: 3, exists: true },
      { nodeId: 'gallery-upper', value: 2, exists: true },
    ]);
    const smaller = expectOk(applyGraphCommand(builtIn, { type: 'remove-node', nodeId: 'store' }));
    expect(analysisRows(result.nodeValues, run.doc, smaller).find((r) => r.nodeId === 'store')!.exists).toBe(false);
    expect(isStale(run, at(builtIn))).toBe(false);
    expect(isStale(run, at(smaller, 2))).toBe(true);
  });
});

describe('spatial transformation preview', () => {
  it('daylight-from-exposure: preview, then Apply replaces the document with the validated result', () => {
    const run = runEntry(at(builtIn), example, entry(example, 'daylight-from-exposure'), {});
    const preview = transformation(run);
    expect(describePreview(preview)).toEqual({
      addedNodes: [],
      addedEdges: [],
      attributeChanges: [{ nodeId: 'entry-gallery', key: 'daylight', from: 'high', to: 'medium' }],
      edgeAttributeChanges: [],
      affectedNodeIds: ['entry-gallery'],
    });
    // The preview never touched the current document.
    expect(builtIn.nodes.find((n) => n.id === 'entry-gallery')!.attributes['daylight']).toBe('high');
    const applied = applyPreview(at(builtIn), preview, 1);
    if (!applied.ok) throw new Error(applied.message);
    expect(applied.doc).toBe(preview.after);
    expect(applied.doc.nodes.find((n) => n.id === 'entry-gallery')!.attributes).toEqual({ daylight: 'medium', public: true });
    expect(validateDocument(applied.doc).ok).toBe(true);
  });

  it('connect-storage-to-galleries: the added door changes the generated boundary only after Apply', () => {
    const preview = transformation(runEntry(at(builtIn), example, entry(example, 'connect-storage-to-galleries'), {}));
    expect(describePreview(preview)).toMatchObject({
      addedEdges: [{ id: 'door-1', source: 'store', target: 'reading-gallery', kind: 'door' }],
      affectedNodeIds: ['reading-gallery', 'store'],
    });
    const wall = (doc: DesignDocument) =>
      resolveFaces(doc).find((f) => [f.ownerNodeId, f.neighbourNodeId].sort().join() === 'reading-gallery,store')!.condition;
    expect(wall(builtIn)).toBe('solid');
    const applied = applyPreview(at(builtIn), preview, 1);
    expect(applied.ok && wall(applied.doc)).toBe('door');
  });

  it('Discard keeps the original design (running produced only a preview)', () => {
    const before = serializeDesign(builtIn);
    transformation(runEntry(at(builtIn), example, entry(example, 'connect-storage-to-galleries'), {}));
    expect(serializeDesign(builtIn)).toBe(before);
  });

  it('rejects a stale preview when the document changed after the run', () => {
    const preview = transformation(runEntry(at(builtIn), example, entry(example, 'daylight-from-exposure'), {}));
    const edited = expectOk(applyGraphCommand(builtIn, { type: 'set-diagram-position', nodeId: 'store', position: [1, 2] }));
    expect(applyPreview(at(edited, 2), preview, 1)).toMatchObject({ ok: false, reason: 'stale' });
    // Applying twice is also refused: after the first apply the document is a different one.
    const once = applyPreview(at(builtIn), preview, 1);
    expect(once.ok && applyPreview(at(once.doc, 2), preview, 1)).toMatchObject({ ok: false, reason: 'stale' });
    expect(applyPreview(null, preview, 1)).toMatchObject({ ok: false, reason: 'no-document' });
  });

  it('a failing transformation reports diagnostics and leaves the design unchanged', async () => {
    const project = await labToolkit({
      'toolkits/lab/algorithms/bad.ts': {
        default: {
          id: 'bad',
          label: 'Bad',
          scope: 'spatial',
          run: () => ({
            kind: 'transformation',
            operations: [
              { op: 'set-node-attribute', nodeId: 'g1', key: 'daylight', value: 'low' },
              { op: 'add-edge', id: 'x', source: 'g1', target: 'k1', kind: 'door' },
            ],
          }),
        },
      },
    });
    const doc = labDoc();
    const before = serializeDesign(doc);
    const run = runEntry(at(doc), project, entry(project, 'bad'), {});
    expect(run.outcome.ok).toBe(false);
    expect(!run.outcome.ok && run.outcome.issues.map((d) => d.code)).toEqual(['invalid-edge-geometry']);
    expect(serializeDesign(doc)).toBe(before);
  });
});

describe('runEntryV2 passes the host (preference-aware) resolution (I1)', () => {
  it('ctx.metrics sees the scenario face preferences the views show, only for the very document run', async () => {
    const seen: unknown[] = [];
    const probe = {
      id: 'probe',
      label: 'Probe',
      scope: 'spatial',
      run: (ctx: { metrics: { value: (m: string, id: string) => unknown } }) => {
        seen.push(ctx.metrics.value('resolution-status', 'e1'));
        return { kind: 'transformation', operations: [] };
      },
    };
    const project = await labToolkit({ 'toolkits/lab/algorithms/probe.ts': { default: probe } });
    const entry = listAlgorithms(project).find((a) => a.id === 'probe')!;
    const doc = metricsLabDoc();
    const spatial = resolveWithPreferences(doc, { e1: { nodeId: 'hall', offset: [0, 0, 0], direction: '-x' } });
    const version = { doc, revision: 1 };
    runEntryV2(version, project, entry, {});
    runEntryV2(version, project, entry, {}, undefined, { doc, spatial });
    // A resolution of another document object is ignored (never mixes documents).
    runEntryV2(version, project, entry, {}, undefined, { doc: metricsLabDoc(), spatial });
    expect(seen).toEqual(['direct', 'unresolved', 'direct']);
  });
});
