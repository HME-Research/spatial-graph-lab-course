import type { GraphPolicy } from '@core/graph';

/** Relationships between rooms: undirected, no self-edges, at most one edge per unordered pair. */
export const SPATIAL_GRAPH_POLICY: GraphPolicy = Object.freeze({
  directed: false,
  allowSelfLoops: false,
  allowParallelEdges: false,
});

/** Generic helpers re-exported for document callers. */
export { unorderedPairKey } from '@core/graph';
export { gridKey } from '@core/spatial';
