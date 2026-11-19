/**
 * Generic graph core: nodes and edges with stable IDs and arbitrary payloads, directed or
 * undirected, with configurable self-loop and parallel-edge policies. Pure TypeScript only:
 * no imports from spatial, architecture, app, viewer or student code, and no dependencies.
 */
export type { EdgeRecord, Graph, GraphId, GraphPolicy, NodeRecord } from './types';
export { fail, formatIssuePath, ok, type Issue, type IssuePath, type Result } from './result';
export { validateGraph, type StructuralIssue, type StructuralIssueCode } from './validate';
export {
  addEdge,
  addNode,
  createGraph,
  removeEdge,
  removeNode,
  updateEdge,
  updateNode,
  type GraphOperationIssue,
  type GraphOperationIssueCode,
  type GraphResult,
} from './operations';
export {
  edgesBetween,
  endpointKey,
  getEdge,
  getNode,
  hasEdge,
  hasNode,
  incidentEdges,
  incomingEdges,
  neighbours,
  opposite,
  outgoingEdges,
  predecessors,
  successors,
  unorderedPairKey,
} from './queries';
export {
  bridges,
  bridgesAndCutNodes,
  compareIds,
  connectedParts,
  cutNodes,
  degree,
  detourIfRemoved,
  diameter,
  edgeEnds,
  graphSize,
  incidentEdgeIds,
  leafNodes,
  mostCentral,
  mostConnected,
  neighbourIds,
  reachWithin,
  sharedNeighbours,
  shortestPath,
  touchingEdges,
  type GraphPath,
  type MeasureGraph,
} from './measures';
