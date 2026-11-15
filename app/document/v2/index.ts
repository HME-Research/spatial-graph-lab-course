/**
 * Design document schema v2 (Gate 0 frozen contract; docs/CONTRACTS-V2.md). Import as
 * `@app/document/v2`. Additive: the v1 module `@app/document` is unchanged and the running app
 * still holds a v1 document until integration switches it.
 */
export * from './constants';
export * from './display';
export * from './footprint';
export * from './migrate';
export * from './schema';
export * from './serialize';
export * from './settings';
export * from './validate';
