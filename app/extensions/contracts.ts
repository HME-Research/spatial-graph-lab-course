import type { FacadeSpec } from '@app/building';
import type {
  AttributeValue as DocumentAttributeValue,
  CorridorLook as DocumentCorridorLook,
  GridCoord as DocumentGridCoord,
  RelationshipEdge,
  RelationshipKind as DocumentRelationshipKind,
  RoomNode,
  RoofStyle,
  RoomSize as DocumentRoomSize,
  WallStyle,
} from '@app/document';
import type { ComputedMetric, MetricValue, MetricValueKind } from '@app/metrics';
import type {
  AttributeValue,
  CorridorLook,
  CorridorRoof,
  CorridorWalls,
  FacadeParameters,
  GridCoord,
  MetricInfo,
  MetricReader,
  RelationshipKind,
  RoomSize,
  SpatialEdge,
  SpatialNode,
} from '@student-api';

/**
 * Compile-time guards: the Student API declares its own types (so it never imports app/), and
 * these checks fail `npm run typecheck` if they drift from the schema-v2 document (students read
 * v2 records) or the building contracts. Runtime consistency is covered by extensions tests (the spatial context's
 * nodes and edges are copies of the v2 document's own records).
 */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export const contractGuards = {
  attributeValue: true satisfies Equals<AttributeValue, DocumentAttributeValue>,
  relationshipKind: true satisfies Equals<RelationshipKind, DocumentRelationshipKind>,
  corridorWalls: true satisfies Equals<CorridorWalls, WallStyle>,
  corridorRoof: true satisfies Equals<CorridorRoof, RoofStyle>,
  corridorLookKeys: true satisfies Equals<keyof CorridorLook, keyof DocumentCorridorLook>,
  corridorLookAssignable: true satisfies (DocumentCorridorLook extends CorridorLook ? true : false),
  facade: true satisfies Equals<keyof FacadeParameters, keyof FacadeSpec>,
  facadeValue: true satisfies Equals<FacadeParameters['windowFraction'], FacadeSpec['windowFraction']>,
  gridCoord: true satisfies Equals<Mutable<GridCoord>, DocumentGridCoord>,
  roomSize: true satisfies Equals<Mutable<RoomSize>, DocumentRoomSize>,
  nodeKeys: true satisfies Equals<keyof SpatialNode, keyof RoomNode>,
  edgeKeys: true satisfies Equals<keyof SpatialEdge, keyof RelationshipEdge>,
  nodeAssignable: true satisfies (RoomNode extends SpatialNode ? true : false),
  edgeAssignable: true satisfies (RelationshipEdge extends SpatialEdge ? true : false),
  metricCollection: true satisfies Equals<MetricInfo['collection'], ComputedMetric['collection']>,
  metricValueKind: true satisfies Equals<MetricInfo['valueKind'], MetricValueKind>,
  metricValue: true satisfies Equals<ReturnType<MetricReader['value']>, MetricValue | null>,
} as const;
