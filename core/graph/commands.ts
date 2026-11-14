import type { EdgeKind } from './constants';
import { fail, issue, type Result } from './errors';
import type { Attributes, DesignDocument, DiagramPosition, GridCoord } from './schema';
import { validateDocument, type ValidationOptions } from './validate';

/**
 * Pure graph commands. Each returns a new validated document or readable issues;
 * the input document is never mutated. No command creates edges implicitly:
 * spatial adjacency alone is never a relationship.
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

const hasNode = (doc: DesignDocument, id: string) => doc.nodes.some((n) => n.id === id);
const hasEdge = (doc: DesignDocument, id: string) => doc.edges.some((e) => e.id === id);

function withoutKey<V>(record: Readonly<Record<string, V>>, key: string): Record<string, V> {
  const copy: Record<string, V> = {};
  for (const [k, v] of Object.entries(record)) if (k !== key) copy[k] = v;
  return copy;
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
  if (!hasNode(doc, nodeId)) return notFound('node', nodeId);
  const next = {
    ...doc,
    nodes: doc.nodes.filter((n) => n.id !== nodeId),
    edges: doc.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    diagram: { positions: withoutKey(doc.diagram.positions, nodeId) },
  };
  return validateDocument(next, options);
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
  if (!hasNode(doc, nodeId)) return notFound('node', nodeId);
  const next = {
    ...doc,
    nodes: doc.nodes.map((n) => (n.id === nodeId ? { ...n, grid: [...grid] } : n)),
  };
  return validateDocument(next, options);
}

/** Set a node's 2D diagram position. Never changes its spatial grid cell. */
export function setDiagramPosition(
  doc: DesignDocument,
  nodeId: string,
  position: DiagramPosition,
  options?: ValidationOptions,
): Result<DesignDocument> {
  if (!hasNode(doc, nodeId)) return notFound('node', nodeId);
  const next = {
    ...doc,
    diagram: { positions: { ...doc.diagram.positions, [nodeId]: [...position] } },
  };
  return validateDocument(next, options);
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
  if (!hasEdge(doc, edgeId)) return notFound('edge', edgeId);
  return validateDocument({ ...doc, edges: doc.edges.filter((e) => e.id !== edgeId) }, options);
}

/** Change an edge's kind; the new kind must suit the nodes' adjacency (horizontal vs vertical). */
export function changeEdgeKind(
  doc: DesignDocument,
  edgeId: string,
  kind: EdgeKind,
  options?: ValidationOptions,
): Result<DesignDocument> {
  if (!hasEdge(doc, edgeId)) return notFound('edge', edgeId);
  const next = { ...doc, edges: doc.edges.map((e) => (e.id === edgeId ? { ...e, kind } : e)) };
  return validateDocument(next, options);
}
