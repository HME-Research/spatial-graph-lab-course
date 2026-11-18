import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Dependency-optimizer cache, one per dev-server port.
 *
 * Several dev servers started from the same checkout (e.g. a student's server plus a test or agent
 * server on another port) would otherwise share `node_modules/.vite`. When any of them
 * re-optimizes dependencies, the others keep serving the old optimized-dependency URLs and the
 * browser gets `504 (Outdated Optimize Dep)` for them. Lazily imported project modules
 * (`toolkits/<id>/toolkit.ts` → `@student-api` → optimized dependencies) then fail with "Failed to
 * fetch dynamically imported module", and the app falls back to the built-in example. Keying the
 * cache by port removes that race (reproduced and verified at Gate 1; see docs/DEVELOPMENT-WORKFLOW.md).
 * Two servers cannot listen on the same port, so they can never share a cache.
 */
function portOf(argv: readonly string[]): string {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--port' && argv[i + 1]) return argv[i + 1]!;
    if (a.startsWith('--port=')) return a.slice('--port='.length);
  }
  return 'default';
}

export default defineConfig({
  plugins: [react()],
  // `@core/*` and `@app/*` are defined once, in tsconfig.json "paths", and shared by tsc, Vite and
  // Vitest. Aliases are an import convenience, not an access-control mechanism.
  resolve: { tsconfigPaths: true },
  // `globalThis.process`: the config runs in Node; no @types/node dependency is needed for this.
  cacheDir: `node_modules/.vite/port-${portOf((globalThis as { process?: { argv?: readonly string[] } }).process?.argv ?? []).replace(/[^0-9a-z-]/gi, '')}`,
  build: {
    // rhino3dm (3DM façade import, loaded lazily) contains `require("ws")` inside its Node-only
    // Emscripten branch. Browsers never execute it, but the bundler would try to resolve it and fail.
    rolldownOptions: { external: ['ws'] },
  },
  test: {
    environment: 'node',
    include: ['core/**/*.test.ts', 'app/**/*.test.ts', 'student-api/**/*.test.ts'],
  },
});
