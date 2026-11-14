import type { EdgeRecord, Graph, GraphPolicy, NodeRecord } from './types';

/** Order-independent key for a pair of node IDs. */
export const unorderedPairKey = (a: string, b: string): string =>
  a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;

/** Key identifying an edge's endpoints under `policy`: ordered if directed, unordered otherwise. */
export const endpointKey = (policy: GraphPolicy, source: string, target: string): string =>
  policy.directed ? `${source}\u0000${target}` : unorderedPairKey(source, target);

export const getNode = <N extends NodeRecord>(graph: Graph<N, EdgeRecord>, id: string): N | undefined =>
  graph.nodes.find((n) => n.id === id);

export const getEdge = <E extends EdgeRecord>(graph: Graph<NodeRecord, E>, id: string): E | undefined =>
  graph.edges.find((e) => e.id === id);

export const hasNode = (graph: Graph, id: string): boolean => graph.nodes.some((n) => n.id === id);

export const hasEdge = (graph: Graph, id: string): boolean => graph.edges.some((e) => e.id === id);

/** The endpoint of `edge` that is not `nodeId` (the node itself for a self-loop). */
export const opposite = (edge: EdgeRecord, nodeId: string): string =>
  edge.source === nodeId ? edge.target : edge.source;

/** Every edge touching `nodeId`, in either direction. A self-loop appears once. */
export const incidentEdges = <E extends EdgeRecord>(graph: Graph<NodeRecord, E>, nodeId: string): E[] =>
  graph.edges.filter((e) => e.source === nodeId || e.target === nodeId);

/** Edges leaving `nodeId`. In an undirected graph this is every incident edge. */
export const outgoingEdges = <E extends EdgeRecord>(graph: Graph<NodeRecord, E>, nodeId: string): E[] =>
  graph.policy.directed ? graph.edges.filter((e) => e.source === nodeId) : incidentEdges(graph, nodeId);

/** Edges arriving at `nodeId`. In an undirected graph this is every incident edge. */
export const incomingEdges = <E extends EdgeRecord>(graph: Graph<NodeRecord, E>, nodeId: string): E[] =>
  graph.policy.directed ? graph.edges.filter((e) => e.target === nodeId) : incidentEdges(graph, nodeId);

const unique = (ids: Iterable<string>): string[] => [...new Set(ids)];

/** IDs reachable by one outgoing edge, without duplicates, in edge order. */
export const successors = (graph: Graph, nodeId: string): string[] =>
  unique(outgoingEdges(graph, nodeId).map((e) => opposite(e, nodeId)));

/** IDs with an edge into `nodeId`, without duplicates, in edge order. */
export const predecessors = (graph: Graph, nodeId: string): string[] =>
  unique(incomingEdges(graph, nodeId).map((e) => opposite(e, nodeId)));

/** IDs joined to `nodeId` by any edge, ignoring direction, without duplicates, in edge order. */
export const neighbours = (graph: Graph, nodeId: string): string[] =>
  unique(incidentEdges(graph, nodeId).map((e) => opposite(e, nodeId)));

/** Edges from `a` to `b` (directed), or joining `a` and `b` in either order (undirected). */
export const edgesBetween = <E extends EdgeRecord>(graph: Graph<NodeRecord, E>, a: string, b: string): E[] => {
  const key = endpointKey(graph.policy, a, b);
  return graph.edges.filter((e) => endpointKey(graph.policy, e.source, e.target) === key);
};
