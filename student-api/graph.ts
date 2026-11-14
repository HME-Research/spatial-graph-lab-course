import type { Graph } from '@core/graph';

/**
 * The genuinely generic graph API: nodes are anything with an `id`, edges anything with an `id`,
 * `source` and `target`. Nothing here knows about grids, node types or attributes.
 * These are the generic core's own public types and pure queries; its operations and internal
 * validation helpers are deliberately not part of the Student API.
 */
export type { EdgeRecord, Graph, GraphPolicy, NodeRecord } from '@core/graph';
export { edgesBetween, getEdge, getNode, incidentEdges, neighbours, opposite } from '@core/graph';

/**
 * The first `${prefix}-${n}` (n = 1, 2, …) that is not a node id, an edge id or in `taken`.
 * Pass the ids you have already chosen in `taken` when creating several items in one run.
 */
export function uniqueId(graph: Graph, prefix: string, taken: Iterable<string> = []): string {
  const used = new Set<string>(taken);
  for (const n of graph.nodes) used.add(n.id);
  for (const e of graph.edges) used.add(e.id);
  for (let n = 1; ; n++) {
    const id = `${prefix}-${n}`;
    if (!used.has(id)) return id;
  }
}
