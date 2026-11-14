import type { Graph, GraphPolicy } from '@core/graph';
import type { DesignDocument, GraphEdge, GraphNode } from './schema';

/**
 * Compatibility adapter between the v1 spatial design document and the generic graph core.
 * The document's own node and edge records ARE the generic records (they already carry `id`,
 * `source` and `target`), so the view is zero-copy and IDs are preserved by construction.
 */

/** v1 relationships: undirected, no self-edges, at most one edge per unordered pair. */
export const SPATIAL_GRAPH_POLICY: GraphPolicy = Object.freeze({
  directed: false,
  allowSelfLoops: false,
  allowParallelEdges: false,
});

export type SpatialGraph = Graph<GraphNode, GraphEdge>;

/** The document's topology as a generic graph. Grid, diagram and metadata stay in the document. */
export const designGraph = (doc: DesignDocument): SpatialGraph => ({
  policy: SPATIAL_GRAPH_POLICY,
  nodes: doc.nodes,
  edges: doc.edges,
});
