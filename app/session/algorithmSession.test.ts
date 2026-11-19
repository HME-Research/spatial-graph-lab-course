import { beforeAll, describe, expect, it } from 'vitest';
import { applyDesignCommand, resolveRelationships } from '@app/spatial';
import { readDesignJson, validateDocumentV2, serializeDesignV2, type DesignDocumentV2 } from '@app/document';
import { resolveBuildingFaces, toResolvedFace } from '@app/building';
import { expectOk } from '@app/document/test-fixtures';
import { type ActiveToolkit } from '@app/extensions';
import { galleryToolkit } from '@app/extensions/test-toolkit';
import { labDoc, labToolkit } from '@app/extensions/test-fixtures';
import { metricsLabDoc } from '@app/metrics/test-fixtures';
import { resolveWithPreferences } from '@app/spatial';
import builtInText from '../document/test-designs/two-storey.json?raw';
import {
  applyPreviewV2,
  describePreview,
  draftsToParameters,
  isStale,
  listAlgorithms,
  parameterProblems,
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
const builtIn = expectOk(readDesignJson(builtInText)).doc;
/** A document shown at a revision (revision 1 unless given). */
const at = (doc: DesignDocumentV2, revision = 1): DocumentVersion => ({ doc, revision });

beforeAll(async () => {
  example = await galleryToolkit();
});

const resolveFaces = (d: DesignDocumentV2) => resolveBuildingFaces(d, resolveRelationships(d)).map(toResolvedFace);
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
    const run = runEntryV2(at(labDoc()), project, list[0]!, {});
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
    const run = runEntryV2(at(labDoc()), project, grow, { count: '0' });
    expect(!run.outcome.ok && run.outcome.issues.map((d) => d.code)).toEqual(['invalid-parameter']);
  });
});

describe('generic analysis results', () => {
  it('passes the picked inputs, returns the answer and node values, and does not modify the document', () => {
    const before = serializeDesignV2(builtIn);
    const run = runEntryV2(at(builtIn), example, entry(example, 'access-depth'), {}, undefined, undefined, [4]);
    expect(serializeDesignV2(builtIn)).toBe(before);
    if (!run.outcome.ok || run.outcome.value.kind !== 'analysis') throw new Error('expected an analysis');
    const { result } = run.outcome.value;
    expect(result.text).toBe('0 room(s) cannot be reached from room 4.');
    expect(result.highlightNodes).toEqual([4]);
    // entry-gallery 1, studio-ground 2, reading-gallery 3, store 4, studio-upper 5, gallery-upper 6
    expect(result.nodeValues).toEqual({ 1: 2, 2: 1, 3: 3, 4: 0, 5: 3, 6: 2 });
    expect(entry(example, 'access-depth').inputs).toEqual([{ kind: 'node', label: 'Start' }]);
    const smaller = expectOk(applyDesignCommand(builtIn, { type: 'remove-node', nodeId: 4 }));
    expect(isStale(run, at(builtIn))).toBe(false);
    expect(isStale(run, at(smaller, 2))).toBe(true);
  });
});

describe('spatial transformation preview', () => {
  it('daylight-from-exposure: preview, then Apply replaces the document with the validated result', () => {
    const run = runEntryV2(at(builtIn), example, entry(example, 'daylight-from-exposure'), {});
    const preview = transformation(run);
    expect(describePreview(preview)).toEqual({
      addedNodes: [],
      addedEdges: [],
      attributeChanges: [{ nodeId: 1, key: 'daylight', from: 'high', to: 'medium' }],
      edgeAttributeChanges: [],
      geometryChanges: [],
      affectedNodeIds: [1],
    });
    // The preview never touched the current document.
    expect(builtIn.nodes.find((n) => n.id === 1)!.attributes['daylight']).toBe('high');
    const applied = applyPreviewV2(at(builtIn), preview, 1);
    if (!applied.ok) throw new Error(applied.message);
    expect(applied.doc).toBe(preview.after);
    expect(applied.doc.nodes.find((n) => n.id === 1)!.attributes).toEqual({ daylight: 'medium', public: true });
    expect(validateDocumentV2(applied.doc).ok).toBe(true);
  });

  it('connect-storage-to-galleries: the added door changes the generated boundary only after Apply', () => {
    const preview = transformation(runEntryV2(at(builtIn), example, entry(example, 'connect-storage-to-galleries'), {}));
    expect(describePreview(preview)).toMatchObject({
      addedEdges: [{ id: 7, source: 4, target: 3, kind: 'access' }], // store → reading-gallery; id from nextEdgeId
      affectedNodeIds: [3, 4],
    });
    const wall = (doc: DesignDocumentV2) =>
      resolveFaces(doc).find((f) => f.ownerNodeId === 3 && f.neighbourNodeId === 4)!.condition;
    expect(wall(builtIn)).toBe('solid');
    const applied = applyPreviewV2(at(builtIn), preview, 1);
    expect(applied.ok && wall(applied.doc)).toBe('door');
  });

  it('lists moved or resized rooms (set-node-geometry) and counts them as affected', () => {
    const before = builtIn;
    const after = { ...builtIn, nodes: builtIn.nodes.map((n) => (n.id === 4 ? { ...n, size: [2, 1, 1] as const } : n)) };
    const node = builtIn.nodes.find((n) => n.id === 4)!;
    expect(describePreview({ before, after })).toMatchObject({
      geometryChanges: [{ nodeId: 4, from: { grid: node.grid, size: node.size }, to: { grid: node.grid, size: [2, 1, 1] } }],
      affectedNodeIds: [4],
    });
  });

  it('Discard keeps the original design (running produced only a preview)', () => {
    const before = serializeDesignV2(builtIn);
    transformation(runEntryV2(at(builtIn), example, entry(example, 'connect-storage-to-galleries'), {}));
    expect(serializeDesignV2(builtIn)).toBe(before);
  });

  it('rejects a stale preview when the document changed after the run', () => {
    const preview = transformation(runEntryV2(at(builtIn), example, entry(example, 'daylight-from-exposure'), {}));
    const edited = expectOk(applyDesignCommand(builtIn, { type: 'set-diagram-position', nodeId: 4, position: [1, 2] }));
    expect(applyPreviewV2(at(edited, 2), preview, 1)).toMatchObject({ ok: false, reason: 'stale' });
    // Applying twice is also refused: after the first apply the document is a different one.
    const once = applyPreviewV2(at(builtIn), preview, 1);
    expect(once.ok && applyPreviewV2(at(once.doc, 2), preview, 1)).toMatchObject({ ok: false, reason: 'stale' });
    expect(applyPreviewV2(null, preview, 1)).toMatchObject({ ok: false, reason: 'no-document' });
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
              { op: 'set-node-attribute', nodeId: 1, key: 'daylight', value: 'low' },
              { op: 'add-edge', source: 1, target: 4, kind: 'stair' },
            ],
          }),
        },
      },
    });
    const doc = labDoc();
    const before = serializeDesignV2(doc);
    const run = runEntryV2(at(doc), project, entry(project, 'bad'), {});
    expect(run.outcome.ok).toBe(false);
    expect(!run.outcome.ok && run.outcome.issues.map((d) => d.code)).toEqual(['unknown-edge-kind']);
    expect(serializeDesignV2(doc)).toBe(before);
  });
});

describe('runEntryV2 passes the host (preference-aware) resolution (I1)', () => {
  it('ctx.metrics sees the scenario face preferences the views show, only for the very document run', async () => {
    const seen: unknown[] = [];
    const probe = {
      id: 'probe',
      label: 'Probe',
      scope: 'spatial',
      run: (ctx: { metrics: { value: (m: string, id: number) => unknown } }) => {
        seen.push(ctx.metrics.value('resolution-status', 1));
        return { kind: 'transformation', operations: [] };
      },
    };
    const project = await labToolkit({ 'toolkits/lab/algorithms/probe.ts': { default: probe } });
    const entry = listAlgorithms(project).find((a) => a.id === 'probe')!;
    const doc = metricsLabDoc();
    const spatial = resolveWithPreferences(doc, { 1: { nodeId: 1, offset: [0, 0, 0], direction: '-x' } });
    const version = { doc, revision: 1 };
    runEntryV2(version, project, entry, {});
    runEntryV2(version, project, entry, {}, undefined, { doc, spatial });
    // A resolution of another document object is ignored (never mixes documents).
    runEntryV2(version, project, entry, {}, undefined, { doc: metricsLabDoc(), spatial });
    expect(seen).toEqual(['direct', 'unresolved', 'direct']);
  });
});
