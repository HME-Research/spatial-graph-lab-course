/**
 * Project envelope and local storage (Gate F, F-B; root-owned). Pure except the IndexedDB
 * adapter in `storage.ts`, which uses only an injected `IDBFactory`.
 */
export * from './projectFile';
export * from './scenarios';
export * from './storage';
