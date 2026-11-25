import type { RhinoModule } from './reader';

/**
 * Load and initialise rhino3dm once per page/process (the WASM heap is large; never create
 * several). Only ever reached through a dynamic `import()`, so neither the rhino3dm glue nor its
 * WASM is part of the main bundle.
 *
 * Provenance (owner-approved reuse, 2026-11-17): adapted from the owner's SpatialCore package
 * `@spatialcore/rhino3dm-import@0.3.0` (`packages/rhino3dm-import/src/loader.ts`): one cached
 * promise, `locateFile` for the WASM URL, and the cache cleared after a failed load so a retry
 * can succeed. Keep this header when changing the file.
 */

/**
 * The exact rhino3dm version this app pins (package.json) and has tested: 8.17.0 (the spike's
 * version), 8.32.2 and 8.35.0 passed the same reader, import and persistence tests (2026-11-17);
 * 8.35.0, the latest stable Rhino 8 release, is pinned. Kept equal to package.json by a test.
 */
export const RHINO3DM_VERSION = '8.35.0';

export interface LoadRhino3dmOptions {
  /** URL of `rhino3dm.wasm` in browsers (`rhino3dm/rhino3dm.wasm?url`). Not needed in Node. */
  readonly wasmUrl?: string;
}

let cached: { readonly key: string; readonly promise: Promise<RhinoModule> } | undefined;

export function loadRhino3dm(options: LoadRhino3dmOptions = {}): Promise<RhinoModule> {
  const key = options.wasmUrl ?? '';
  if (cached && cached.key === key) return cached.promise;
  const promise = (async () => {
    const mod: unknown = await import('rhino3dm');
    const factory = (mod as { default?: unknown }).default ?? mod;
    if (typeof factory !== 'function') throw new Error('rhino3dm did not export a factory function');
    const config: Record<string, unknown> = {};
    if (options.wasmUrl) {
      const url = options.wasmUrl;
      config.locateFile = (path: string, dir: string) => (path.endsWith('.wasm') ? url : dir + path);
    }
    return (factory as (config: Record<string, unknown>) => Promise<RhinoModule>)(config);
  })();
  cached = { key, promise };
  promise.catch(() => {
    if (cached?.promise === promise) cached = undefined;
  });
  return promise;
}
