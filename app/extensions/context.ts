import { EDGE_KINDS, gridKey, isEdgeGeometryValid, SPATIAL_GRAPH_POLICY, type DesignDocument, type EdgeKind } from '@app/document';
import type {
  AttributeSpecs,
  AttributesOf,
  EdgeRecord,
  GraphAlgorithmContext,
  GridCoord,
  NodeRecord,
  NodeTypeDefinition,
  SpatialAlgorithmContext,
  SpatialNode,
} from '@student-api';
import type { ActiveProject } from './activate';
import { effectiveAttributes } from './attributes';
import { diagnostic, type ExtensionDiagnostic } from './diagnostics';

/**
 * Builds algorithm contexts from a document. Safety comes from copying: every context holds a
 * fresh copy of plain data, so nothing an algorithm does can reach the application's document.
 * Plain data is additionally frozen only so that mutation attempts fail loudly (a debugging aid,
 * not the safety mechanism). Query functions close over private lookup tables.
 */

/** Thrown inside a run to fail it with a specific diagnostic (caught by runAlgorithm). */
export class ExtensionRunError extends Error {
  constructor(readonly diagnostic: ExtensionDiagnostic) {
    super(diagnostic.message);
  }
}

export function freezeDeep<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) freezeDeep(v);
  }
  return value;
}

export function buildGraphContext<P extends AttributeSpecs>(doc: DesignDocument, params: AttributesOf<P>): GraphAlgorithmContext<P> {
  const nodes: NodeRecord[] = doc.nodes.map((n) => ({ id: n.id }));
  const edges: EdgeRecord[] = doc.edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));
  return freezeDeep({ graph: { policy: { ...SPATIAL_GRAPH_POLICY }, nodes, edges }, params: structuredClone(params) });
}

const isGrid = (g: unknown): g is GridCoord =>
  Array.isArray(g) && g.length === 3 && g.every((c) => typeof c === 'number' && Number.isInteger(c));

export function buildSpatialContext<P extends AttributeSpecs>(
  doc: DesignDocument,
  project: ActiveProject,
  algorithmId: string,
  params: AttributesOf<P>,
): SpatialAlgorithmContext<P> {
  const design = freezeDeep({
    policy: { ...SPATIAL_GRAPH_POLICY },
    nodes: structuredClone(doc.nodes),
    edges: structuredClone(doc.edges),
  });
  const occupant = new Map(doc.nodes.map((n) => [gridKey(n.grid), n.id] as const));
  const subject = { kind: 'algorithm', id: algorithmId } as const;
  const runError = (code: 'type-not-registered' | 'broken-node-type' | 'type-mismatch', message: string) =>
    new ExtensionRunError(diagnostic(code, 'error', subject, message));

  return Object.freeze({
    design,
    params: freezeDeep(structuredClone(params)),
    nodeAt: (cell: GridCoord) => (isGrid(cell) ? occupant.get(gridKey([cell[0], cell[1], cell[2]])) : undefined),
    canConnect: (kind: string, a: GridCoord, b: GridCoord) =>
      (EDGE_KINDS as readonly string[]).includes(kind) &&
      isGrid(a) &&
      isGrid(b) &&
      isEdgeGeometryValid(kind as EdgeKind, [a[0], a[1], a[2]], [b[0], b[1], b[2]]),
    attributesOf<A extends AttributeSpecs>(node: SpatialNode, type: NodeTypeDefinition<A>): AttributesOf<A> {
      const entry = project.nodeTypes.find((t) => t.definition === type);
      const name = typeof type === 'object' && type !== null && typeof type.id === 'string' ? `"${type.id}"` : 'the given value';
      if (!entry) {
        throw runError('type-not-registered', `attributesOf: ${name} is not a node type definition registered by project "${project.id}" (import it from the project's types/ folder)`);
      }
      if (!entry.status.ok) {
        throw runError('broken-node-type', `attributesOf: node type "${entry.id}" (${entry.file}) is invalid, so algorithms cannot use it`);
      }
      if (node?.typeId !== entry.id) {
        throw runError('type-mismatch', `attributesOf: node "${node?.id}" has type "${node?.typeId}", not "${entry.id}"`);
      }
      return freezeDeep(effectiveAttributes(entry.definition.attributes ?? {}, node.attributes)) as AttributesOf<A>;
    },
  });
}
