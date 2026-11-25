import {
  edgesBetween as coreEdgesBetween,
  getEdge as coreGetEdge,
  getNode as coreGetNode,
  incidentEdges as coreIncidentEdges,
  neighbours as coreNeighbours,
  opposite as coreOpposite,
  type GraphPolicy,
} from '@core/graph';

/**
 * The genuinely generic graph API: nodes are anything with an `id`, edges anything with an `id`,
 * `source` and `target`. Nothing here knows about grids, node types or attributes. Ids are whole
 * numbers (P4), as in the design document. These wrap the generic core's own pure queries; its
 * operations and internal validation helpers are deliberately not part of the Student API.
 */
export type { GraphPolicy } from '@core/graph';

/** Minimum shape of a node: a whole-number id. */
export interface NodeRecord {
  readonly id: number;
}

/** Minimum shape of an edge. For undirected graphs `source`/`target` order carries no meaning. */
export interface EdgeRecord {
  readonly id: number;
  readonly source: number;
  readonly target: number;
}

/** An immutable graph value (`policy`, `nodes`, `edges`). */
export interface Graph<N extends NodeRecord = NodeRecord, E extends EdgeRecord = EdgeRecord> {
  readonly policy: GraphPolicy;
  readonly nodes: readonly N[];
  readonly edges: readonly E[];
}

export const getNode = <N extends NodeRecord>(graph: Graph<N, EdgeRecord>, id: number): N | undefined => coreGetNode(graph, id);
export const getEdge = <E extends EdgeRecord>(graph: Graph<NodeRecord, E>, id: number): E | undefined => coreGetEdge(graph, id);
/** The endpoint of `edge` that is not `nodeId`. */
export const opposite = (edge: EdgeRecord, nodeId: number): number => coreOpposite(edge, nodeId) as number;
/** Every edge touching `nodeId`. */
export const incidentEdges = <E extends EdgeRecord>(graph: Graph<NodeRecord, E>, nodeId: number): E[] => coreIncidentEdges(graph, nodeId);
/** Ids joined to `nodeId` by any edge, without duplicates, in edge order. */
export const neighbours = (graph: Graph, nodeId: number): number[] => coreNeighbours(graph, nodeId) as number[];
/** Edges joining `a` and `b` (in either order for an undirected graph). */
export const edgesBetween = <E extends EdgeRecord>(graph: Graph<NodeRecord, E>, a: number, b: number): E[] => coreEdgesBetween(graph, a, b);
