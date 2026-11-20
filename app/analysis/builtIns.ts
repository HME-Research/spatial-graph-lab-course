import type { AttributeValue } from '@app/document';
import {
  bridgesAndCutNodes,
  connectedParts,
  degree,
  diameter,
  edgeEnds,
  edgeSides,
  graphSize,
  incidentEdgeIds,
  leafNodes,
  mostCentral,
  mostConnected,
  neighbourIds,
  reachWithin,
  routesThrough,
  sharedNeighbours,
  shortestPath,
  touchingEdges,
  type GraphPath,
} from '@core/graph';
import { BUILT_IN_ANALYSES } from '@app/ui/analysisSections';

/**
 * The built-in analyses (Programme P4, Analyse tab): pure functions from a graph (ids and
 * endpoints only) and the picked inputs to an ANSWER for the panel and the highlights for the
 * views. Graph vocabulary only (node, edge, steps); rooms appear only in the explainers.
 */

/** Numeric-id graph: the document's nodes and edges (ids and endpoints are all that is read). */
export interface AnalysisGraph {
  readonly nodes: readonly { readonly id: number }[];
  readonly edges: readonly { readonly id: number; readonly source: number; readonly target: number }[];
}

/**
 * What the Analyse panel shows: a big `answer`, a short `label` and at most one small `detail`
 * line; the views highlight `highlightNodes` / `highlightEdges` and colour by `nodeValues`.
 */
export interface AnalysisAnswer {
  readonly answer: string;
  readonly label: string;
  readonly detail?: string;
  readonly highlightNodes: readonly number[];
  readonly highlightEdges: readonly number[];
  readonly nodeValues?: Readonly<Record<number, AttributeValue>>;
}

export type AnalysisOutcome = { readonly ok: true; readonly answer: AnalysisAnswer } | { readonly ok: false; readonly messages: readonly string[] };

const MAX_LISTED = 8;

/** "2, 5, 7" or "2, 5, 7, … (+3 more)". */
export function listIds(ids: readonly (number | string)[], max = MAX_LISTED): string {
  if (ids.length <= max) return ids.join(', ');
  return `${ids.slice(0, max).join(', ')}, … (+${ids.length - max} more)`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const nodesWord = (ids: readonly (number | string)[]) => `${ids.length === 1 ? 'node' : 'nodes'} ${listIds(ids)}`;
/** An edge as the app labels it: `3 → 7`. */
export const edgeName = (graph: AnalysisGraph, edgeId: number): string => {
  const ends = edgeEnds(graph, edgeId);
  return ends ? `${ends.source} → ${ends.target}` : `edge ${edgeId}`;
};
const pathText = (path: GraphPath) => path.nodes.join(' → ');
const nums = (ids: readonly (number | string)[]) => ids as readonly number[];

const ok = (answer: Omit<AnalysisAnswer, 'highlightNodes' | 'highlightEdges'> & Partial<Pick<AnalysisAnswer, 'highlightNodes' | 'highlightEdges'>>): AnalysisOutcome => ({
  ok: true,
  answer: { highlightNodes: [], highlightEdges: [], ...answer },
});
const refuse = (message: string): AnalysisOutcome => ({ ok: false, messages: [message] });

type Runner = (graph: AnalysisGraph, inputs: readonly number[]) => AnalysisOutcome;

const RUNNERS: Readonly<Record<string, Runner>> = {
  degree: (graph, [node]) => {
    const d = degree(graph, node!);
    if (d === undefined) return refuse(`There is no node ${node}.`);
    return ok({ answer: String(d), label: `${d === 1 ? 'edge' : 'edges'} at node ${node}`, highlightNodes: [node!], highlightEdges: incidentEdgeIds(graph, node!) as number[] });
  },
  neighbours: (graph, [node]) => {
    if (degree(graph, node!) === undefined) return refuse(`There is no node ${node}.`);
    const ids = nums(neighbourIds(graph, node!));
    return ok({
      answer: String(ids.length),
      label: `${ids.length === 1 ? 'neighbour' : 'neighbours'} of node ${node}`,
      ...(ids.length > 0 && { detail: nodesWord(ids) }),
      highlightNodes: ids,
      highlightEdges: nums(incidentEdgeIds(graph, node!)),
    });
  },
  'shared-neighbours': (graph, [edge]) => {
    const ids = sharedNeighbours(graph, edge!);
    const ends = edgeEnds(graph, edge!);
    if (!ids || !ends) return refuse(`There is no edge ${edge}.`);
    const toEnds = (n: number) => nums(incidentEdgeIds(graph, n)).filter((e) => {
      const x = edgeEnds(graph, e)!;
      return [x.source, x.target].some((m) => m === ends.source || m === ends.target);
    });
    return ok({
      answer: String(ids.length),
      label: `${ids.length === 1 ? 'node' : 'nodes'} joined to both ${ends.source} and ${ends.target}`,
      ...(ids.length > 0 && { detail: nodesWord(ids) }),
      highlightNodes: nums(ids),
      highlightEdges: [...new Set(nums(ids).flatMap(toEnds))],
    });
  },
  'routes-through': (graph, [edge]) => {
    const routes = routesThrough(graph, edge!);
    const sides = edgeSides(graph, edge!);
    const ends = edgeEnds(graph, edge!);
    if (!routes || !sides || !ends) return refuse(`There is no edge ${edge}.`);
    const a = ends.source as number;
    const b = ends.target as number;
    // Owner 2026-11-20: one number per end. a's side = the nodes nearer a than b (a included): from
    // b, the edge leads to each of them on a shortest route. On a tree, trips = a's side × b's side.
    const sideA = nums(sides.source);
    const sideB = nums(sides.target);
    const reachable = new Set<number>(nums(reachWithin(graph, a, Infinity)!.nodes));
    const equal = nums(sides.neither).filter((n) => reachable.has(n));
    const nodeValues: Record<number, string> = {};
    for (const n of sideA) nodeValues[n] = `${a}'s side`;
    for (const n of sideB) nodeValues[n] = `${b}'s side`;
    const isProduct = sideA.length > 0 && Math.abs(routes.trips - sideA.length * sideB.length) < 1e-9;
    const detail = [
      `${formatTrips(routes.trips)} of ${routes.pairs} trips take it on a shortest route${isProduct ? ` (${sideA.length} × ${sideB.length})` : ''}`,
      ...(sideA.length > 0 ? [`${a}'s side: ${nodesWord(sideA)}`, `${b}'s side: ${nodesWord(sideB)}`] : []),
      ...(equal.length > 0 ? [`equally near both: ${nodesWord(equal)}`] : []),
    ].join(' · ');
    return ok({
      answer: `${sideA.length} · ${sideB.length}`,
      label: `nodes on ${a}'s side · on ${b}'s side of ${edgeName(graph, edge!)}`,
      detail,
      highlightNodes: [a, b],
      highlightEdges: [edge!],
      nodeValues,
    });
  },
  'ends-connections': (graph, [edge]) => {
    const ends = edgeEnds(graph, edge!);
    if (!ends) return refuse(`There is no edge ${edge}.`);
    const a = ends.source as number;
    const b = ends.target as number;
    const da = degree(graph, a)!;
    const db = degree(graph, b)!;
    const role = (n: number, d: number) => (d <= 1 ? `${n} is a dead end` : d >= 3 ? `${n} is a hub` : `${n} is on the way through`);
    return ok({
      answer: `${da} · ${db}`,
      label: `edges at node ${a} · at node ${b}`,
      detail: `${role(a, da)}, ${role(b, db)}`,
      highlightNodes: [a, b],
      highlightEdges: [...new Set([...nums(incidentEdgeIds(graph, a)), ...nums(incidentEdgeIds(graph, b))])],
    });
  },
  'touching-edges': (graph, [edge]) => {
    const ids = touchingEdges(graph, edge!);
    if (!ids) return refuse(`There is no edge ${edge}.`);
    return ok({
      answer: String(ids.length),
      label: `${ids.length === 1 ? 'edge shares' : 'edges share'} a node with ${edgeName(graph, edge!)}`,
      ...(ids.length > 0 && { detail: listIds(nums(ids).map((e) => edgeName(graph, e))) }),
      highlightEdges: nums(ids),
    });
  },
  summary: (graph) => {
    const size = graphSize(graph);
    return ok({ answer: `${size.nodes} · ${size.edges}`, label: 'nodes · edges', detail: `${plural(size.nodes, 'node')} and ${plural(size.edges, 'edge')}` });
  },
  'most-connected-node': (graph) => {
    const best = mostConnected(graph);
    if (!best) return ok({ answer: '—', label: 'the graph has no nodes' });
    const ids = nums(best.nodes);
    return ok({
      answer: listIds(ids),
      label: `${ids.length === 1 ? 'node has' : 'nodes have'} the most edges: ${best.degree}`,
      highlightNodes: ids,
      highlightEdges: [...new Set(ids.flatMap((n) => nums(incidentEdgeIds(graph, n))))],
    });
  },
  'connected-parts': (graph) => {
    const parts = connectedParts(graph);
    const nodeValues: Record<number, number> = {};
    parts.forEach((part, i) => {
      for (const id of part) nodeValues[id as number] = i + 1;
    });
    return ok({
      answer: String(parts.length),
      label: parts.length === 1 ? 'connected part: every node can reach every other' : 'connected parts (coloured by part)',
      ...(parts.length > 1 && { detail: `sizes ${listIds(parts.map((p) => p.length))}`, nodeValues }),
    });
  },
  bridges: (graph) => {
    const ids = nums(bridgesAndCutNodes(graph).bridges);
    return ok({
      answer: String(ids.length),
      label: ids.length === 1 ? 'bridge: removing it splits the graph' : 'bridges: removing one splits the graph',
      ...(ids.length > 0 && { detail: listIds(ids.map((e) => edgeName(graph, e))) }),
      highlightEdges: ids,
    });
  },
  'cut-nodes': (graph) => {
    const ids = nums(bridgesAndCutNodes(graph).cutNodes);
    return ok({
      answer: String(ids.length),
      label: ids.length === 1 ? 'cut node: removing it splits the graph' : 'cut nodes: removing one splits the graph',
      ...(ids.length > 0 && { detail: nodesWord(ids) }),
      highlightNodes: ids,
    });
  },
  'leaf-nodes': (graph) => {
    const ids = nums(leafNodes(graph));
    return ok({
      answer: String(ids.length),
      label: ids.length === 1 ? 'leaf node: exactly one edge' : 'leaf nodes: exactly one edge each',
      ...(ids.length > 0 && { detail: nodesWord(ids) }),
      highlightNodes: ids,
    });
  },
  diameter: (graph) => {
    const d = diameter(graph);
    if (!d) return ok({ answer: '—', label: 'the graph has no nodes' });
    return ok({
      answer: String(d.steps),
      label: `${d.steps === 1 ? 'step' : 'steps'} on the longest shortest path`,
      detail: d.parts > 1 ? `graph is in ${d.parts} parts: longest within one part (${pathText(d.path)})` : pathText(d.path),
      highlightNodes: nums(d.path.nodes),
      highlightEdges: nums(d.path.edges),
    });
  },
  'most-central-node': (graph) => {
    const c = mostCentral(graph);
    if (!c) return ok({ answer: '—', label: 'the graph has no nodes' });
    const ids = nums(c.nodes);
    return ok({
      answer: listIds(ids),
      label: `fewest steps in total to all other nodes: ${c.totalSteps}`,
      ...(c.parts > 1 && { detail: `graph is in ${c.parts} parts: compared within the largest (${c.partSize} nodes)` }),
      highlightNodes: ids,
    });
  },
  'shortest-path': (graph, [from, to]) => {
    if (degree(graph, from!) === undefined) return refuse(`There is no node ${from}.`);
    if (degree(graph, to!) === undefined) return refuse(`There is no node ${to}.`);
    const path = shortestPath(graph, from!, to!);
    if (!path) return ok({ answer: 'No path', label: `from ${from} to ${to}: they are in different connected parts`, highlightNodes: [from!, to!] });
    return ok({
      answer: String(path.edges.length),
      label: `${path.edges.length === 1 ? 'step' : 'steps'} from ${from} to ${to}`,
      detail: pathText(path),
      highlightNodes: nums(path.nodes),
      highlightEdges: nums(path.edges),
    });
  },
  'reach-within-k': (graph, [start, k]) => {
    const reach = reachWithin(graph, start!, k!);
    if (!reach) return refuse(`There is no node ${start}.`);
    const ids = nums(reach.nodes);
    return ok({
      answer: String(ids.length),
      label: `${ids.length === 1 ? 'node' : 'nodes'} within ${plural(k!, 'step')} of ${start}`,
      ...(ids.length > 0 && { detail: nodesWord(ids) }),
      highlightNodes: [start!, ...ids],
      highlightEdges: nums(reach.edges),
    });
  },
};

/** Ids of every built-in analysis that has a runner (all of `BUILT_IN_ANALYSES`; checked by tests). */
export const BUILT_IN_RUNNER_IDS: readonly string[] = Object.keys(RUNNERS);

/**
 * Run built-in analysis `id` on `graph` with the picked `inputs` (ids / numbers in the declared
 * order). Unknown ids and inputs that do not fit are refused with a readable reason; never throws.
 */
export function runBuiltInAnalysis(id: string, graph: AnalysisGraph, inputs: readonly number[]): AnalysisOutcome {
  const def = BUILT_IN_ANALYSES.find((a) => a.id === id);
  const runner = Object.prototype.hasOwnProperty.call(RUNNERS, id) ? RUNNERS[id] : undefined;
  if (!def || !runner) return refuse(`There is no built-in analysis "${id}".`);
  if (inputs.length !== def.inputs.length) return refuse(`${def.name} needs ${plural(def.inputs.length, 'input')}.`);
  for (const [i, input] of def.inputs.entries()) {
    const v = inputs[i]!;
    if (!Number.isFinite(v)) return refuse(`${input.label}: type a number.`);
    if (input.kind === 'number') {
      if (input.min !== undefined && v < input.min) return refuse(`${input.label} must be at least ${input.min}.`);
      if (input.max !== undefined && v > input.max) return refuse(`${input.label} must be at most ${input.max}.`);
    }
  }
  return runner(graph, inputs);
}

/** Trips through an edge: whole numbers as they are, shares of several routes to one decimal. */
export const formatTrips = (n: number): string => (Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : n.toFixed(1));

/** A number as an answer: whole numbers as they are, others to 3 decimals. */
export const formatAnswerNumber = (n: number): string => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));

/**
 * The answer of a toolkit (or uploaded) analysis from its VALIDATED result: `value` (else `text`,
 * else a count of what it highlights) is the big answer; the analysis name is the label; `text`
 * under a value is the one small line.
 */
export function analysisResultAnswer(
  name: string,
  result: {
    readonly value?: number;
    readonly text?: string;
    readonly highlightNodes?: readonly number[];
    readonly highlightEdges?: readonly number[];
    readonly nodeValues?: Readonly<Record<number, AttributeValue>>;
  },
): AnalysisAnswer {
  const nodes = result.highlightNodes ?? [];
  const edges = result.highlightEdges ?? [];
  const counted = [nodes.length > 0 ? plural(nodes.length, 'node') : '', edges.length > 0 ? plural(edges.length, 'edge') : ''].filter(Boolean).join(', ');
  const answer = result.value !== undefined ? formatAnswerNumber(result.value) : (result.text ?? (counted || (result.nodeValues ? 'Values' : '—')));
  return {
    answer,
    label: result.value === undefined && result.text === undefined && counted ? `highlighted by ${name}` : name,
    ...(result.value !== undefined && result.text !== undefined && { detail: result.text }),
    highlightNodes: nodes,
    highlightEdges: edges,
    ...(result.nodeValues !== undefined && { nodeValues: result.nodeValues }),
  };
}
