/**
 * Student API (version 1, schema-v2 data): the only module project code may import (`@student-api`).
 * Since schema v2, spatial records carry `size`/`displayId` and edges an `access`/`open` kind;
 * legacy v1 kinds stay accepted by `add-edge` and `canConnect` (see docs/STUDENT-API.md).
 *
 * It contains compile-time contracts, identity `define…` helpers and a few pure graph/grid
 * helpers. It performs no validation: the application validates every definition and result at
 * runtime. Imports only core/graph and core/spatial (student-api/boundary.test.ts).
 */
export type { AttributeSpec, AttributeSpecs, AttributeValue, AttributesOf, ValueOf } from './attributes';
export {
  defineProject,
  type ProjectAttributes,
  type ProjectAttributeSpec,
  type ProjectAttributeSpecs,
  type ProjectDefinition,
} from './project';
export { defineNodeType, type FacadeParameters, type NodeTypeDefinition } from './types';
export {
  edgesBetween,
  getEdge,
  getNode,
  incidentEdges,
  neighbours,
  opposite,
  uniqueId,
  type EdgeRecord,
  type Graph,
  type GraphPolicy,
  type NodeRecord,
} from './graph';
export {
  FACE_DIRECTIONS,
  neighbourCell,
  roomCells,
  type ConnectorStyle,
  type FaceDirection,
  type GridCoord,
  type RelationshipKind,
  type RoomSize,
  type SpatialEdge,
  type SpatialEdgeKind,
  type SpatialNode,
} from './spatial';
export {
  defineGraphAlgorithm,
  defineSpatialAlgorithm,
  type AnalysisResult,
  type AttributeFieldInfo,
  type GraphAlgorithm,
  type GraphAlgorithmContext,
  type MetricInfo,
  type MetricReader,
  type GraphAlgorithmDefinition,
  type SpatialAlgorithm,
  type SpatialAlgorithmContext,
  type SpatialAlgorithmDefinition,
  type SpatialOperation,
  type TransformationResult,
} from './algorithms';
