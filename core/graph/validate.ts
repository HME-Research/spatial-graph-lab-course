import { endpointKey } from './queries';
import type { Issue, IssuePath } from './result';
import type { EdgeRecord, Graph, GraphId } from './types';

/** Structural problems a graph value can have, independent of what its nodes mean. */
export type StructuralIssueCode =
  | 'duplicate-node-id'
  | 'duplicate-edge-id'
  | 'dangling-edge'
  | 'self-loop'
  | 'parallel-edge';

export type StructuralIssue = Issue<StructuralIssueCode>;

const at = (path: IssuePath, code: StructuralIssueCode, message: string): StructuralIssue => ({ path, code, message });

/** Issue builders shared by whole-graph validation and single-edge operations. */
export const structuralIssue = {
  duplicateNodeId: (index: number, id: GraphId, firstIndex: number) =>
    at(['nodes', index, 'id'], 'duplicate-node-id', `duplicate node id "${id}" (first used at nodes[${firstIndex}])`),
  duplicateEdgeId: (index: number, id: GraphId, firstIndex: number) =>
    at(['edges', index, 'id'], 'duplicate-edge-id', `duplicate edge id "${id}" (first used at edges[${firstIndex}])`),
  selfLoop: (index: number, edge: EdgeRecord) =>
    at(['edges', index], 'self-loop', `edge "${edge.id}" connects node "${edge.source}" to itself`),
  dangling: (index: number, edge: EdgeRecord, end: 'source' | 'target') =>
    at(['edges', index, end], 'dangling-edge', `edge "${edge.id}" references missing node "${edge[end]}"`),
  parallel: (index: number, edge: EdgeRecord, existingId: GraphId) =>
    at(
      ['edges', index],
      'parallel-edge',
      `edge "${edge.id}" duplicates edge "${existingId}": only one edge is allowed between "${edge.source}" and "${edge.target}"`,
    ),
};

/**
 * Every structural problem in `graph`, in array order (nodes first, then edges; per edge: id,
 * self-loop, endpoints, parallelism). A disallowed self-loop is reported alone for that edge.
 * Pure; never throws; knows nothing about the payload.
 */
export function validateGraph(graph: Graph): StructuralIssue[] {
  const { policy } = graph;
  const issues: StructuralIssue[] = [];

  const nodeIndexById = new Map<GraphId, number>();
  graph.nodes.forEach((node, i) => {
    const first = nodeIndexById.get(node.id);
    if (first !== undefined) issues.push(structuralIssue.duplicateNodeId(i, node.id, first));
    else nodeIndexById.set(node.id, i);
  });

  const edgeIndexById = new Map<GraphId, number>();
  const edgeIdByEndpoints = new Map<string, GraphId>();
  graph.edges.forEach((edge, i) => {
    const first = edgeIndexById.get(edge.id);
    if (first !== undefined) issues.push(structuralIssue.duplicateEdgeId(i, edge.id, first));
    else edgeIndexById.set(edge.id, i);

    if (edge.source === edge.target && !policy.allowSelfLoops) {
      issues.push(structuralIssue.selfLoop(i, edge));
      return;
    }
    if (!nodeIndexById.has(edge.source)) issues.push(structuralIssue.dangling(i, edge, 'source'));
    if (!nodeIndexById.has(edge.target)) issues.push(structuralIssue.dangling(i, edge, 'target'));

    if (!policy.allowParallelEdges) {
      const key = endpointKey(policy, edge.source, edge.target);
      const existing = edgeIdByEndpoints.get(key);
      if (existing !== undefined) issues.push(structuralIssue.parallel(i, edge, existing));
      else edgeIdByEndpoints.set(key, edge.id);
    }
  });

  return issues;
}
