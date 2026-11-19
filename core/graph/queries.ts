import type { EdgeRecord, Graph, GraphId, GraphPolicy, NodeRecord } from './types';

/** Order-independent key for a pair of node IDs. */
export const unorderedPairKey = (a: GraphId, b: GraphId): string =>
  a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;

/** Key identifying an edge's endpoints under `policy`: ordered if directed, unordered otherwise. */
export const endpointKey = (policy: GraphPolicy, source: GraphId, target: GraphId): string =>
  policy.directed ? `${source}\u0000${target}` : unorderedPairKey(source, target);

export const getNode = <N extends NodeRecord>(graph: Graph<N, EdgeRecord>, id: GraphId): N | undefined =>
  graph.nodes.find((n) => n.id === id);

export const getEdge = <E extends EdgeRecord>(graph: Graph<NodeRecord, E>, id: GraphId): E | undefined =>
  graph.edges.find((e) => e.id === id);

export const hasNode = (graph: Graph, id: GraphId): boolean => graph.nodes.some((n) => n.id === id);

export const hasEdge = (graph: Graph, id: GraphId): boolean => graph.edges.some((e) => e.id === id);

/** The endpoint of `edge` that is not `nodeId` (the node itself for a self-loop). */
export const opposite = (edge: EdgeRecord, nodeId: GraphId): GraphId =>
  edge.source === nodeId ? edge.target : edge.source;

/** Every edge touching `nodeId`, in either direction. A self-loop appears once. */
export const incidentEdges = <E extends EdgeRecord>(graph: Graph<NodeRecord, E>, nodeId: GraphId): E[] =>
  graph.edges.filter((e) => e.source === nodeId || e.target === nodeId);

/** Edges leaving `nodeId`. In an undirected graph this is every incident edge. */
export const outgoingEdges = <E extends EdgeRecord>(graph: Graph<NodeRecord, E>, nodeId: GraphId): E[] =>
  graph.policy.directed ? graph.edges.filter((e) => e.source === nodeId) : incidentEdges(graph, nodeId);

/** Edges arriving at `nodeId`. In an undirected graph this is every incident edge. */
export const incomingEdges = <E extends EdgeRecord>(graph: Graph<NodeRecord, E>, nodeId: GraphId): E[] =>
  graph.policy.directed ? graph.edges.filter((e) => e.target === nodeId) : incidentEdges(graph, nodeId);

const unique = (ids: Iterable<GraphId>): GraphId[] => [...new Set(ids)];

/** IDs reachable by one outgoing edge, without duplicates, in edge order. */
export const successors = (graph: Graph, nodeId: GraphId): GraphId[] =>
  unique(outgoingEdges(graph, nodeId).map((e) => opposite(e, nodeId)));

/** IDs with an edge into `nodeId`, without duplicates, in edge order. */
export const predecessors = (graph: Graph, nodeId: GraphId): GraphId[] =>
  unique(incomingEdges(graph, nodeId).map((e) => opposite(e, nodeId)));

/** IDs joined to `nodeId` by any edge, ignoring direction, without duplicates, in edge order. */
export const neighbours = (graph: Graph, nodeId: GraphId): GraphId[] =>
  unique(incidentEdges(graph, nodeId).map((e) => opposite(e, nodeId)));

/** Edges from `a` to `b` (directed), or joining `a` and `b` in either order (undirected). */
export const edgesBetween = <E extends EdgeRecord>(graph: Graph<NodeRecord, E>, a: GraphId, b: GraphId): E[] => {
  const key = endpointKey(graph.policy, a, b);
  return graph.edges.filter((e) => endpointKey(graph.policy, e.source, e.target) === key);
};
