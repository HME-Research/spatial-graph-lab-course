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
export * from './functionColours';
export * from './resolveAttributes';
export * from './conformance';
export * from './context';
export * from './definitions';
export * from './diagnostics';
export * from './discover';
export * from './run';
export * from './toolkitExamples';
export { applyTransformationV2, type TransformationPreviewV2 } from './transformV2';
export { TOOLKIT_GLOBS } from './toolkitGlobs';
export * from './uploadedAnalyses';
export { formatUploadSize, MAX_UPLOAD_BYTES, MAX_UPLOADED_ANALYSES, MAX_UPLOAD_FILE_NAME, sourceProblems, uploadLanguage } from './uploadSource';
/** Student API types the application shell needs (only app/extensions may import `@student-api`). */
export type { AnalysisResult, AttributeSpec, AttributeSpecs, ParameterSpec, ToolkitAttributeSpec, SpatialOperation } from '@student-api';
