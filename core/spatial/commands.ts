import {
  hasNode as graphHasNode,
  removeEdge as graphRemoveEdge,
  removeNode as graphRemoveNode,
  updateEdge as graphUpdateEdge,
  updateNode as graphUpdateNode,
  type GraphResult,
} from '../graph';
import type { EdgeKind } from './constants';
import { fail, issue, type Result } from './errors';
import { designGraph } from './graph';
import type { Attributes, DesignDocument, DiagramPosition, GraphEdge, GraphNode, GridCoord } from './schema';
import { validateDocument, type ValidationOptions } from './validate';

/**
 * Pure graph commands. Each returns a new validated document or readable issues;
 * the input document is never mutated. No command creates edges implicitly:
 * spatial adjacency alone is never a relationship.
 *
 * Topology changes (removal with incident-edge cleanup, record updates) are delegated to the
 * generic graph core; every candidate document is then validated in full by `validateDocument`,
 * so issue codes and messages remain those of the v1 document. Additions are appended and
 * validated in full (not pre-checked by the core) so that ALL problems, structural and spatial,
 * are reported together, exactly as before.
 */

export interface NewNode {
  readonly id: string;
  readonly grid: GridCoord;
  readonly typeId: string;
  readonly attributes?: Attributes;
}

export interface NewEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly kind: EdgeKind;
  readonly attributes?: Attributes;
}

const notFound = (what: 'node' | 'edge', id: string): Result<DesignDocument> =>
  fail([issue([what === 'node' ? 'nodes' : 'edges'], 'not-found', `${what} "${id}" does not exist`)]);

function withoutKey<V>(record: Readonly<Record<string, V>>, key: string): Record<string, V> {
  const copy: Record<string, V> = {};
  for (const [k, v] of Object.entries(record)) if (k !== key) copy[k] = v;
  return copy;
}

/**
 * Validate `doc` with its topology replaced by a generic-core result. For the operations used
 * here the core can only fail with `not-found`, which is reported in the v1 wording.
 */
function withTopology(
  doc: DesignDocument,
  result: GraphResult<GraphNode, GraphEdge>,
  missing: readonly ['node' | 'edge', string],
  options: ValidationOptions | undefined,
  diagram: DesignDocument['diagram'] = doc.diagram,
): Result<DesignDocument> {
  if (!result.ok) return notFound(missing[0], missing[1]);
  return validateDocument({ ...doc, nodes: result.value.nodes, edges: result.value.edges, diagram }, options);
}

/** Add a node; optionally give it a diagram position. Does not add any edges. */
export function addNode(
  doc: DesignDocument,
  node: NewNode,
  diagramPosition?: DiagramPosition,
  options?: ValidationOptions,
): Result<DesignDocument> {
  const next = {
    ...doc,
    nodes: [...doc.nodes, { id: node.id, grid: [...node.grid], typeId: node.typeId, attributes: { ...node.attributes } }],
    diagram: diagramPosition
      ? { positions: { ...doc.diagram.positions, [node.id]: [...diagramPosition] } }
      : doc.diagram,
  };
  return validateDocument(next, options);
}

/** Remove a node, its incident edges and its diagram position. */
export function removeNode(doc: DesignDocument, nodeId: string, options?: ValidationOptions): Result<DesignDocument> {
  return withTopology(doc, graphRemoveNode(designGraph(doc), nodeId), ['node', nodeId], options, {
    positions: withoutKey(doc.diagram.positions, nodeId),
  });
}

/**
 * Move a node to another spatial cell. Rejected if the cell is occupied or if any
 * incident edge would no longer satisfy its face-adjacency rule. Diagram position is unchanged.
 */
export function moveNode(
  doc: DesignDocument,
  nodeId: string,
  grid: GridCoord,
  options?: ValidationOptions,
): Result<DesignDocument> {
  const result = graphUpdateNode(designGraph(doc), nodeId, (n): GraphNode => ({ ...n, grid: [...grid] }));
  return withTopology(doc, result, ['node', nodeId], options);
}

/** Set a node's 2D diagram position. Never changes its spatial grid cell. */
export function setDiagramPosition(
  doc: DesignDocument,
  nodeId: string,
  position: DiagramPosition,
  options?: ValidationOptions,
): Result<DesignDocument> {
  if (!graphHasNode(designGraph(doc), nodeId)) return notFound('node', nodeId);
  const next = {
    ...doc,
    diagram: { positions: { ...doc.diagram.positions, [nodeId]: [...position] } },
  };
  return validateDocument(next, options);
}

/** Change a node's programme type. Grid cell, edges and diagram position are unchanged. */
export function setNodeType(
  doc: DesignDocument,
  nodeId: string,
  typeId: string,
  options?: ValidationOptions,
): Result<DesignDocument> {
  const result = graphUpdateNode(designGraph(doc), nodeId, (n) => ({ ...n, typeId }));
  return withTopology(doc, result, ['node', nodeId], options);
}

/** Replace a node's whole attribute record (values must be JSON primitives). */
export function setNodeAttributes(
  doc: DesignDocument,
  nodeId: string,
  attributes: Attributes,
  options?: ValidationOptions,
): Result<DesignDocument> {
  const result = graphUpdateNode(designGraph(doc), nodeId, (n) => ({ ...n, attributes: { ...attributes } }));
  return withTopology(doc, result, ['node', nodeId], options);
}

/** Add an explicit typed relationship between two face-adjacent nodes. */
export function addEdge(doc: DesignDocument, edge: NewEdge, options?: ValidationOptions): Result<DesignDocument> {
  const next = {
    ...doc,
    edges: [
      ...doc.edges,
      { id: edge.id, source: edge.source, target: edge.target, kind: edge.kind, attributes: { ...edge.attributes } },
    ],
  };
  return validateDocument(next, options);
}

export function removeEdge(doc: DesignDocument, edgeId: string, options?: ValidationOptions): Result<DesignDocument> {
  return withTopology(doc, graphRemoveEdge(designGraph(doc), edgeId), ['edge', edgeId], options);
}

/** Change an edge's kind; the new kind must suit the nodes' adjacency (horizontal vs vertical). */
export function changeEdgeKind(
  doc: DesignDocument,
  edgeId: string,
  kind: EdgeKind,
  options?: ValidationOptions,
): Result<DesignDocument> {
  const result = graphUpdateEdge(designGraph(doc), edgeId, (e) => ({ ...e, kind }));
  return withTopology(doc, result, ['edge', edgeId], options);
}
