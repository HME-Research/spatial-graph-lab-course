/**
 * Project extensions: discovery, activation and runtime validation of student definitions,
 * document conformance to project types, and validated algorithm execution. Pure (no React or
 * Three.js); activation is the only asynchronous step. Students never import this module.
 */
export * from './activate';
export * from './attributes';
export * from './attributeBaseline';
export * from './attributeEdits';
export * from './projectAttributes';
export * from './projectFunctions';
export * from './resolveAttributes';
export * from './conformance';
export * from './context';
export * from './definitions';
export * from './diagnostics';
export * from './discover';
export * from './run';
export * from './transform';
export { applyTransformationV2, type TransformationPreviewV2 } from './transformV2';
export { TOOLKIT_GLOBS } from './toolkitGlobs';
/** Student API types the application shell needs (only app/extensions may import `@student-api`). */
export type { AnalysisResult, AttributeSpec, AttributeSpecs, ToolkitAttributeSpec, SpatialOperation } from '@student-api';
