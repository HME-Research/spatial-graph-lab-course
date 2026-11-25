/**
 * Generic graph data model. Knows nothing about space, grids, buildings, rendering or file
 * formats: a node is anything with a stable `id`; an edge is anything with an `id` and two
 * endpoint IDs. Payload is whatever extra fields the caller's record types declare.
 */

/**
 * A node or edge identity: a string or a number. Within one graph every id has the same type
 * (the application's design document uses whole numbers).
 */
export type GraphId = string | number;

/** Minimum shape of a node. Extend it with any payload fields. */
export interface NodeRecord {
  readonly id: GraphId;
}

/** Minimum shape of an edge. For undirected graphs `source`/`target` order carries no meaning. */
export interface EdgeRecord {
  readonly id: GraphId;
  readonly source: GraphId;
  readonly target: GraphId;
}

/** Structural rules a graph enforces. Chosen per graph, never assumed. */
export interface GraphPolicy {
  readonly directed: boolean;
  /** Whether an edge may connect a node to itself. */
  readonly allowSelfLoops: boolean;
  /** Whether several edges may join the same endpoints (same ordered pair if directed, unordered pair otherwise). */
  readonly allowParallelEdges: boolean;
}

/**
 * An immutable graph value. Arrays keep insertion order, so serialisers built on top stay
 * deterministic. Operations return new graphs and never mutate their input.
 */
export interface Graph<N extends NodeRecord = NodeRecord, E extends EdgeRecord = EdgeRecord> {
  readonly policy: GraphPolicy;
  readonly nodes: readonly N[];
  readonly edges: readonly E[];
}
