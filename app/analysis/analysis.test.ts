import { describe, expect, it } from 'vitest';
import { NO_SELECTION, selectEdge, selectNode } from '@core/viewer/selection';
import { ANALYSE_SECTION_IDS, BUILT_IN_ANALYSES } from '@app/ui/analysisSections';
import {
  analysisItems,
  applyPick,
  allPicked,
  catalogueFor,
  currentPrompt,
  DEFAULT_SHOWN_ANALYSES,
  itemsBySection,
  pickedInputs,
  pickSummary,
  sanitizeShownAnalyses,
  selectionInputs,
  setAnalysisShown,
  setPickNumber,
  startPick,
  type AnalysisItem,
} from './analyseModel';
import { BUILT_IN_RUNNER_IDS, listIds, runBuiltInAnalysis, type AnalysisGraph, type AnalysisOutcome } from './builtIns';
import { ANALYSE_VS_TRANSFORM, ANALYSIS_EXPLAINERS, analysisExplainer, SECTION_EXPLAINERS, sectionExplainer } from './explainers';

/** The built-in example house (app/document/examples/house.json): a tree, rooms 1–7, edges 1–6. */
const HOUSE: AnalysisGraph = {
  nodes: [1, 2, 3, 4, 5, 6, 7].map((id) => ({ id })),
  edges: [
    { id: 1, source: 1, target: 2 },
    { id: 2, source: 2, target: 3 },
    { id: 3, source: 3, target: 4 },
    { id: 4, source: 2, target: 5 },
    { id: 5, source: 5, target: 6 },
    { id: 6, source: 5, target: 7 },
  ],
};
/** The same house with a loop 2–3–4–2 and a separate pair 8–9. */
const LOOPED: AnalysisGraph = {
  nodes: [...HOUSE.nodes, { id: 8 }, { id: 9 }],
  edges: [...HOUSE.edges, { id: 7, source: 4, target: 2 }, { id: 8, source: 8, target: 9 }],
};

function answer(outcome: AnalysisOutcome) {
  if (!outcome.ok) throw new Error(outcome.messages.join('; '));
  return outcome.answer;
}

describe('built-in analyses', () => {
  it('every built-in has a runner and an explainer; every section has an explainer', () => {
    expect([...BUILT_IN_RUNNER_IDS].sort()).toEqual(BUILT_IN_ANALYSES.map((a) => a.id).sort());
    expect(ANALYSIS_EXPLAINERS.map((e) => e.id)).toEqual(BUILT_IN_ANALYSES.map((a) => a.id));
    for (const a of BUILT_IN_ANALYSES) expect(analysisExplainer(a.id)?.title, a.id).toBe(a.name);
    for (const s of ANALYSE_SECTION_IDS) expect(sectionExplainer(s), s).toBeDefined();
    expect(SECTION_EXPLAINERS).toHaveLength(4);
    expect(ANALYSE_VS_TRANSFORM.id).toBe('analysis-vs-transformation');
    // The owner's edits: no "for the Student API", diagrams left for item H.
    for (const e of [...SECTION_EXPLAINERS, ...ANALYSIS_EXPLAINERS, ANALYSE_VS_TRANSFORM]) {
      expect(JSON.stringify(e)).not.toContain('for the Student API');
      expect(e.diagram).toBeUndefined();
    }
  });

  it('node analyses: degree highlights the edges; neighbours lists them', () => {
    expect(answer(runBuiltInAnalysis('degree', HOUSE, [2]))).toEqual({ answer: '3', label: 'edges at node 2', highlightNodes: [2], highlightEdges: [1, 2, 4] });
    expect(answer(runBuiltInAnalysis('degree', HOUSE, [1])).label).toBe('edge at node 1');
    expect(answer(runBuiltInAnalysis('neighbours', HOUSE, [5]))).toMatchObject({ answer: '3', detail: 'nodes 2, 6, 7', highlightNodes: [2, 6, 7] });
    expect(runBuiltInAnalysis('degree', HOUSE, [99])).toEqual({ ok: false, messages: ['There is no node 99.'] });
  });

  it('edge analyses: shared neighbours, detour (bridge or way round), touching edges', () => {
    expect(answer(runBuiltInAnalysis('shared-neighbours', HOUSE, [2]))).toMatchObject({ answer: '0', highlightNodes: [] });
    expect(answer(runBuiltInAnalysis('shared-neighbours', LOOPED, [2]))).toMatchObject({ answer: '1', detail: 'node 4', highlightNodes: [4], highlightEdges: [3, 7] });
    expect(answer(runBuiltInAnalysis('detour-if-removed', HOUSE, [1]))).toMatchObject({ answer: 'Splits the graph', highlightEdges: [1] });
    expect(answer(runBuiltInAnalysis('detour-if-removed', LOOPED, [2]))).toMatchObject({ answer: '2', detail: '2 → 4 → 3', highlightEdges: [7, 3] });
    expect(answer(runBuiltInAnalysis('touching-edges', HOUSE, [4]))).toMatchObject({ answer: '4', label: 'edges share a node with 2 → 5', highlightEdges: [1, 2, 5, 6] });
  });

  it('network analyses on the example house', () => {
    expect(answer(runBuiltInAnalysis('summary', HOUSE, []))).toMatchObject({ answer: '7 · 6', detail: '7 nodes and 6 edges' });
    expect(answer(runBuiltInAnalysis('most-connected-node', HOUSE, []))).toMatchObject({ answer: '2, 5', label: 'nodes have the most edges: 3', highlightNodes: [2, 5] });
    expect(answer(runBuiltInAnalysis('connected-parts', HOUSE, []))).toMatchObject({ answer: '1' });
    expect(answer(runBuiltInAnalysis('connected-parts', HOUSE, [])).nodeValues).toBeUndefined();
    expect(answer(runBuiltInAnalysis('bridges', HOUSE, []))).toMatchObject({ answer: '6', highlightEdges: [1, 2, 3, 4, 5, 6] });
    expect(answer(runBuiltInAnalysis('cut-nodes', HOUSE, []))).toMatchObject({ answer: '3', highlightNodes: [2, 3, 5] });
    expect(answer(runBuiltInAnalysis('leaf-nodes', HOUSE, []))).toMatchObject({ answer: '4', highlightNodes: [1, 4, 6, 7] });
    expect(answer(runBuiltInAnalysis('diameter', HOUSE, []))).toMatchObject({ answer: '4', detail: '4 → 3 → 2 → 5 → 6', highlightEdges: [3, 2, 4, 5] });
    expect(answer(runBuiltInAnalysis('most-central-node', HOUSE, []))).toMatchObject({ answer: '2', label: 'fewest steps in total to all other nodes: 9', highlightNodes: [2] });
  });

  it('network analyses on a disconnected graph say so', () => {
    const parts = answer(runBuiltInAnalysis('connected-parts', LOOPED, []));
    expect(parts).toMatchObject({ answer: '2', detail: 'sizes 7, 2' });
    expect(parts.nodeValues).toEqual({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 2, 9: 2 });
    expect(answer(runBuiltInAnalysis('diameter', LOOPED, [])).detail).toContain('graph is in 2 parts');
    expect(answer(runBuiltInAnalysis('most-central-node', LOOPED, [])).detail).toBe('graph is in 2 parts: compared within the largest (7 nodes)');
    expect(answer(runBuiltInAnalysis('bridges', LOOPED, [])).highlightEdges).toEqual([1, 4, 5, 6, 8]);
  });

  it('empty graph answers without failing', () => {
    const empty: AnalysisGraph = { nodes: [], edges: [] };
    for (const id of ['summary', 'most-connected-node', 'connected-parts', 'bridges', 'cut-nodes', 'leaf-nodes', 'diameter', 'most-central-node']) {
      expect(runBuiltInAnalysis(id, empty, []).ok, id).toBe(true);
    }
    expect(answer(runBuiltInAnalysis('diameter', empty, []))).toMatchObject({ answer: '—', label: 'the graph has no nodes' });
  });

  it('queries: shortest path and reach within k steps', () => {
    expect(answer(runBuiltInAnalysis('shortest-path', HOUSE, [1, 7]))).toEqual({
      answer: '3',
      label: 'steps from 1 to 7',
      detail: '1 → 2 → 5 → 7',
      highlightNodes: [1, 2, 5, 7],
      highlightEdges: [1, 4, 6],
    });
    expect(answer(runBuiltInAnalysis('shortest-path', LOOPED, [1, 9]))).toMatchObject({ answer: 'No path', highlightNodes: [1, 9] });
    expect(answer(runBuiltInAnalysis('reach-within-k', HOUSE, [1, 2]))).toMatchObject({ answer: '3', label: 'nodes within 2 steps of 1', detail: 'nodes 2, 3, 5', highlightNodes: [1, 2, 3, 5] });
    expect(runBuiltInAnalysis('reach-within-k', HOUSE, [1, 0])).toEqual({ ok: false, messages: ['Steps must be at least 1.'] });
    expect(runBuiltInAnalysis('shortest-path', HOUSE, [1])).toEqual({ ok: false, messages: ['Shortest path needs 2 inputs.'] });
    expect(runBuiltInAnalysis('nope', HOUSE, []).ok).toBe(false);
  });

  it('long lists are shortened', () => {
    expect(listIds([1, 2, 3])).toBe('1, 2, 3');
    expect(listIds([1, 2, 3, 4], 2)).toBe('1, 2, … (+2 more)');
  });
});

describe('Analyse panel model', () => {
  it('lists the built-ins shown at start, then the toolkit analyses in their derived sections', () => {
    expect(DEFAULT_SHOWN_ANALYSES).toEqual(['degree', 'neighbours', 'shared-neighbours', 'summary', 'most-connected-node', 'connected-parts', 'shortest-path']);
    const items = analysisItems(DEFAULT_SHOWN_ANALYSES, {
      name: 'House',
      analyses: [
        { id: 'depth', label: 'Depth', inputs: [{ kind: 'node', label: 'Start' }], enabled: true, problems: [] },
        { id: 'pair', label: 'Pair', inputs: [{ kind: 'node', label: 'A' }, { kind: 'number', label: 'k' }], enabled: true, problems: [] },
      ],
    });
    const by = itemsBySection(items, 'all');
    expect(by.node.map((i) => i.key)).toEqual(['built-in:degree', 'built-in:neighbours', 'toolkit:depth']);
    expect(by.edge.map((i) => i.id)).toEqual(['shared-neighbours']);
    expect(by.network.map((i) => i.id)).toEqual(['summary', 'most-connected-node', 'connected-parts']);
    expect(by.queries.map((i) => i.id)).toEqual(['shortest-path', 'pair']);
    expect(itemsBySection(items, 'toolkit').node.map((i) => i.id)).toEqual(['depth']);
    expect(itemsBySection(items, 'built-in').queries.map((i) => i.id)).toEqual(['shortest-path']);
    expect(itemsBySection(items, 'yours').node).toEqual([]);
    expect(items.find((i) => i.id === 'depth')!.source).toEqual({ kind: 'toolkit', toolkitName: 'House' });
  });

  it('the "+" catalogue adds and removes built-ins; stored choices are sanitised', () => {
    expect(catalogueFor('edge', DEFAULT_SHOWN_ANALYSES)).toEqual([
      { id: 'shared-neighbours', name: 'Shared neighbours', shown: true },
      { id: 'detour-if-removed', name: 'Detour if removed', shown: false },
      { id: 'touching-edges', name: 'Touching edges', shown: false },
    ]);
    const added = setAnalysisShown(DEFAULT_SHOWN_ANALYSES, 'bridges', true);
    expect(added).toContain('bridges');
    expect(added.indexOf('bridges')).toBe(added.indexOf('connected-parts') + 1);
    expect(setAnalysisShown(added, 'degree', false)).not.toContain('degree');
    expect(sanitizeShownAnalyses(undefined)).toBe(DEFAULT_SHOWN_ANALYSES);
    expect(sanitizeShownAnalyses('x')).toBe(DEFAULT_SHOWN_ANALYSES);
    expect(sanitizeShownAnalyses(['bridges', 'gone', 3, 'degree'])).toEqual(['degree', 'bridges']);
    expect(sanitizeShownAnalyses([])).toEqual([]);
  });

  it('Node / Edge analyses run on a matching selection, else a hint', () => {
    const node = { inputs: [{ kind: 'node' as const, label: 'Node' }], section: 'node' as const };
    expect(selectionInputs(node, selectNode(4))).toEqual({ inputs: [4] });
    expect(selectionInputs(node, selectEdge(4))).toEqual({ hint: 'Select a node first (in any view).' });
    expect(selectionInputs({ inputs: [], section: 'network' }, NO_SELECTION)).toEqual({ inputs: [] });
    expect(selectionInputs({ inputs: [{ kind: 'edge', label: 'Edge' }], section: 'edge' }, NO_SELECTION)).toEqual({ hint: 'Select an edge first (in any view).' });
  });

  const query = (inputs: AnalysisItem['inputs']): Pick<AnalysisItem, 'key' | 'inputs'> => ({ key: 'built-in:q', inputs });

  it('Queries: the selection fills the first matching input, then each pick fills the next', () => {
    let s = startPick(query([{ kind: 'node', label: 'From' }, { kind: 'node', label: 'To' }]), selectNode(3));
    expect(pickSummary(s)).toBe('From 3 · To ?');
    expect(currentPrompt(s)!.text).toBe('Pick To (a node) in any view');
    s = applyPick(s, { kind: 'edge', id: 2 });
    expect(s.message).toBe('To needs a node, not an edge.');
    expect(allPicked(s)).toBe(false);
    s = applyPick(s, { kind: 'node', id: 7 });
    expect(s.message).toBeNull();
    expect(allPicked(s)).toBe(true);
    expect(pickedInputs(s)).toEqual({ inputs: [3, 7] });
    // An edge selection does not fill a node input.
    expect(currentPrompt(startPick(query([{ kind: 'node', label: 'From' }, { kind: 'edge', label: 'Via' }]), selectEdge(1)))!.text).toBe('Pick From (a node) in any view');
  });

  it('Queries: numbers start at their default and are checked', () => {
    let s = startPick(query([{ kind: 'node', label: 'Start' }, { kind: 'number', label: 'Steps', min: 1, default: 2 }]), NO_SELECTION);
    expect(currentPrompt(s)!.text).toBe('Pick Start (a node) in any view');
    s = applyPick(s, { kind: 'node', id: 1 });
    expect(currentPrompt(s)).toMatchObject({ kind: 'number', text: 'Steps' });
    expect(pickedInputs(s)).toEqual({ inputs: [1, 2] });
    expect(pickedInputs(setPickNumber(s, 1, 0))).toEqual({ problem: 'Steps must be at least 1.' });
    expect(pickedInputs(setPickNumber(s, 1, Number.NaN))).toEqual({ problem: 'Type a number for Steps.' });
  });
});
