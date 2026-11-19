/**
 * Student API: the only module toolkit code may import (`@student-api`). Spatial records are the
 * design document's own rooms (`size`) and relationships (`access` | `open`); see docs/STUDENT-API.md.
 *
 * It contains compile-time contracts, identity `define…` helpers and a few pure graph/grid
 * helpers. It performs no validation: the application validates every definition and result at
 * runtime. Imports only core/graph and core/spatial (student-api/boundary.test.ts).
 */
export type { AttributeSpec, AttributeSpecs, AttributeValue, AttributesOf, ParameterSpec, ParameterSpecs, ValueOf } from './attributes';
export {
  defineToolkit,
  type ToolkitAttributes,
  type ToolkitAttributeSpec,
  type ToolkitAttributeSpecs,
  type ToolkitDefinition,
} from './toolkit';
export { defineFunction, type FacadeParameters, type FunctionDefinition } from './functions';
export {
  edgesBetween,
  getEdge,
  getNode,
  incidentEdges,
  neighbours,
  opposite,
  type EdgeRecord,
  type Graph,
  type GraphPolicy,
  type NodeRecord,
} from './graph';
export {
  FACE_DIRECTIONS,
  neighbourCell,
  roomCells,
  type CorridorLook,
  type CorridorRoof,
  type CorridorWalls,
  type FaceDirection,
  type GridCoord,
  type RelationshipKind,
  type RoomSize,
  type SpatialEdge,
  type SpatialNode,
} from './spatial';
export {
  defineGraphAlgorithm,
  defineSpatialAlgorithm,
  type AnalysisInput,
  type AnalysisResult,
  type CustomFieldInfo,
  type GraphAlgorithm,
  type GraphAlgorithmContext,
  type ItemRef,
  type MetricInfo,
  type MetricReader,
  type GraphAlgorithmDefinition,
  type SpatialAlgorithm,
  type SpatialAlgorithmContext,
  type SpatialAlgorithmDefinition,
  type SpatialOperation,
  type TransformationResult,
} from './algorithms';
