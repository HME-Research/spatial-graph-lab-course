import type { FacadeSpec } from '@app/building';
import type { AttributeValue as DocumentAttributeValue, EdgeKind, GraphEdge, GraphNode, GridCoord as DocumentGridCoord } from '@app/document';
import type {
  AttributeValue,
  FacadeParameters,
  GridCoord,
  SpatialEdge,
  SpatialEdgeKind,
  SpatialNode,
} from '@student-api';

/**
 * Compile-time guards: the Student API declares its own types (so it never imports app/), and
 * these checks fail `npm run typecheck` if they drift from the schema-v1 document or the
 * building contracts. Runtime consistency is covered by extensions tests (the spatial context's
 * nodes and edges are copies of the document's own records).
 */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export const contractGuards = {
  attributeValue: true satisfies Equals<AttributeValue, DocumentAttributeValue>,
  edgeKind: true satisfies Equals<SpatialEdgeKind, EdgeKind>,
  facade: true satisfies Equals<keyof FacadeParameters, keyof FacadeSpec>,
  facadeValue: true satisfies Equals<FacadeParameters['windowFraction'], FacadeSpec['windowFraction']>,
  gridCoord: true satisfies Equals<Mutable<GridCoord>, DocumentGridCoord>,
  nodeKeys: true satisfies Equals<keyof SpatialNode, keyof GraphNode>,
  edgeKeys: true satisfies Equals<keyof SpatialEdge, keyof GraphEdge>,
  nodeAssignable: true satisfies (GraphNode extends SpatialNode ? true : false),
  edgeAssignable: true satisfies (GraphEdge extends SpatialEdge ? true : false),
} as const;
