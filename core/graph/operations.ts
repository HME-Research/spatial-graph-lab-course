import { endpointKey } from './queries';
import { fail, ok, type Issue, type Result } from './result';
import type { EdgeRecord, Graph, GraphPolicy, NodeRecord } from './types';
import { structuralIssue, validateGraph, type StructuralIssue, type StructuralIssueCode } from './validate';

/**
 * Pure, immutable graph operations. Each returns a new graph or the issues that prevented the
 * change; the input graph is never mutated. Payload fields are copied by reference, untouched.
 */

export type GraphOperationIssueCode = StructuralIssueCode | 'not-found' | 'id-changed';
export type GraphOperationIssue = Issue<GraphOperationIssueCode>;
export type GraphResult<N extends NodeRecord, E extends EdgeRecord> = Result<Graph<N, E>, GraphOperationIssue>;

const notFound = (what: 'node' | 'edge', id: string): GraphOperationIssue => ({
  path: [what === 'node' ? 'nodes' : 'edges'],
  code: 'not-found',
  message: `${what} "${id}" does not exist`,
});

const idChanged = (what: 'node' | 'edge', index: number, from: string, to: string): GraphOperationIssue => ({
  path: [what === 'node' ? 'nodes' : 'edges', index, 'id'],
  code: 'id-changed',
  message: `an update may not change ${what} id "${from}" to "${to}"`,
});

/** Build a graph from records, rejecting it if it is structurally invalid under `policy`. */
export function createGraph<N extends NodeRecord, E extends EdgeRecord>(
  policy: GraphPolicy,
  nodes: readonly N[] = [],
  edges: readonly E[] = [],
): Result<Graph<N, E>, StructuralIssue> {
  const graph: Graph<N, E> = { policy, nodes: [...nodes], edges: [...edges] };
  const issues = validateGraph(graph);
  return issues.length > 0 ? fail(issues) : ok(graph);
}

export function addNode<N extends NodeRecord, E extends EdgeRecord>(graph: Graph<N, E>, node: N): GraphResult<N, E> {
  const first = graph.nodes.findIndex((n) => n.id === node.id);
  if (first !== -1) return fail([structuralIssue.duplicateNodeId(graph.nodes.length, node.id, first)]);
  return ok({ ...graph, nodes: [...graph.nodes, node] });
}

/** Remove a node and every edge incident to it. */
export function removeNode<N extends NodeRecord, E extends EdgeRecord>(graph: Graph<N, E>, nodeId: string): GraphResult<N, E> {
  if (!graph.nodes.some((n) => n.id === nodeId)) return fail([notFound('node', nodeId)]);
  return ok({
    ...graph,
    nodes: graph.nodes.filter((n) => n.id !== nodeId),
    edges: graph.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
  });
}

/** Replace a node's record with `update(node)`. The ID must stay the same. */
export function updateNode<N extends NodeRecord, E extends EdgeRecord>(
  graph: Graph<N, E>,
  nodeId: string,
  update: (node: N) => N,
): GraphResult<N, E> {
  const index = graph.nodes.findIndex((n) => n.id === nodeId);
  if (index === -1) return fail([notFound('node', nodeId)]);
  const next = update(graph.nodes[index]!);
  if (next.id !== nodeId) return fail([idChanged('node', index, nodeId, next.id)]);
  return ok({ ...graph, nodes: graph.nodes.map((n, i) => (i === index ? next : n)) });
}

/** Structural issues `edge` would have at `index`, ignoring the edge at `replacing` (for updates). */
function edgeIssues(graph: Graph, edge: EdgeRecord, index: number, replacing = -1): StructuralIssue[] {
  const others = graph.edges.map((e, i) => [e, i] as const).filter(([, i]) => i !== replacing);
  const issues: StructuralIssue[] = [];
  const sameId = others.find(([e]) => e.id === edge.id);
  if (sameId) issues.push(structuralIssue.duplicateEdgeId(index, edge.id, sameId[1]));
  if (edge.source === edge.target && !graph.policy.allowSelfLoops) return [...issues, structuralIssue.selfLoop(index, edge)];
  for (const end of ['source', 'target'] as const) {
    if (!graph.nodes.some((n) => n.id === edge[end])) issues.push(structuralIssue.dangling(index, edge, end));
  }
  if (!graph.policy.allowParallelEdges) {
    const key = endpointKey(graph.policy, edge.source, edge.target);
    const parallel = others.find(([e]) => endpointKey(graph.policy, e.source, e.target) === key);
    if (parallel) issues.push(structuralIssue.parallel(index, edge, parallel[0].id));
  }
  return issues;
}

/** Add an edge; rejected for a duplicate ID, missing endpoint, or a self-loop/parallel edge the policy forbids. */
export function addEdge<N extends NodeRecord, E extends EdgeRecord>(graph: Graph<N, E>, edge: E): GraphResult<N, E> {
  const issues = edgeIssues(graph, edge, graph.edges.length);
  return issues.length > 0 ? fail(issues) : ok({ ...graph, edges: [...graph.edges, edge] });
}

export function removeEdge<N extends NodeRecord, E extends EdgeRecord>(graph: Graph<N, E>, edgeId: string): GraphResult<N, E> {
  if (!graph.edges.some((e) => e.id === edgeId)) return fail([notFound('edge', edgeId)]);
  return ok({ ...graph, edges: graph.edges.filter((e) => e.id !== edgeId) });
}

/**
 * Replace an edge's record with `update(edge)`. The ID must stay the same. If the endpoints
 * change, the new endpoints are checked against the graph and its policy.
 */
export function updateEdge<N extends NodeRecord, E extends EdgeRecord>(
  graph: Graph<N, E>,
  edgeId: string,
  update: (edge: E) => E,
): GraphResult<N, E> {
  const index = graph.edges.findIndex((e) => e.id === edgeId);
  if (index === -1) return fail([notFound('edge', edgeId)]);
  const current = graph.edges[index]!;
  const next = update(current);
  if (next.id !== edgeId) return fail([idChanged('edge', index, edgeId, next.id)]);
  if (next.source !== current.source || next.target !== current.target) {
    const issues = edgeIssues(graph, next, index, index);
    if (issues.length > 0) return fail(issues);
  }
  return ok({ ...graph, edges: graph.edges.map((e, i) => (i === index ? next : e)) });
}
