/**
 * Imported assets (3DM façade modules). Pure: no React, Three.js or DOM.
 *
 * Not exported here, on purpose: the import pipeline (`./importFacade.ts`), the reader
 * (`./rhino/reader.ts`) and the browser entry (`./rhino/browser.ts`). The app reaches them only
 * through `import('@app/assets/rhino/browser')`, so rhino3dm's glue, its WASM and the reader stay
 * out of the main bundle (checked on the production build).
 */
export * from './binary';
export * from './facadeAdapter';
export * from './facadeAsset';
export * from './placement';
