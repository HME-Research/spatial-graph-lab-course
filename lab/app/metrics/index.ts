/**
 * Computed metrics (calculated, read-only values derived from the design). Pure; no React or
 * Three.js. Contract: `contracts.ts` (Gate F, root-owned); catalogue, selection, rows and system
 * field accessors: workstream M.
 */
export * from './contracts';
export * from './catalogue';
export { BUILT_IN_METRICS, createMetricEvaluator, METRIC_CACHE_ENTRIES } from './registry';
export * from './rows';
export * from './selection';
export * from './system';
