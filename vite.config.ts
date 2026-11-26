import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

/**
 * Dependency-optimizer cache, one per dev-server port.
 *
 * Several dev servers started from the same checkout (e.g. a student's server plus a test or agent
 * server on another port) would otherwise share `node_modules/.vite`. When any of them
 * re-optimizes dependencies, the others keep serving the old optimized-dependency URLs and the
 * browser gets `504 (Outdated Optimize Dep)` for them. Lazily imported project modules
 * (`toolkits/<id>/toolkit.ts` → `@student-api` → optimized dependencies) then fail with "Failed to
 * fetch dynamically imported module", and the app falls back to the built-in example. Keying the
 * cache by port removes that race (reproduced and verified at Gate 1; see lab/docs/DEVELOPMENT-WORKFLOW.md).
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

/**
 * The student tutorial (`tutorial/`, plain HTML that also opens by double-click) is served at
 * `/tutorial/`: the dev server serves it from the repository root as it is, and this plugin copies
 * it unchanged into `dist/tutorial/` for the build (owner 2026-11-25). Nothing in it is bundled.
 */
function tutorialPages(): Plugin {
  type Fs = {
    readdirSync(dir: string, options: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
    readFileSync(path: string): Uint8Array;
  };
  let root = '.';
  return {
    name: 'sgl-tutorial-pages',
    apply: 'build',
    configResolved(config) {
      root = config.root;
    },
    generateBundle() {
      const fs = (globalThis as unknown as { process: { getBuiltinModule(id: string): Fs } }).process.getBuiltinModule('node:fs');
      const copy = (dir: string): void => {
        for (const entry of fs.readdirSync(`${root}/${dir}`, { withFileTypes: true })) {
          const path = `${dir}/${entry.name}`;
          if (entry.isDirectory()) copy(path);
          else this.emitFile({ type: 'asset', fileName: path, source: fs.readFileSync(`${root}/${path}`) });
        }
      };
      copy('tutorial');
      // `/tutorial/` on the hosted app opens the start page. Only the build gets this file: the
      // students' tutorial/ folder lists just the numbered pages (owner 2026-11-26).
      this.emitFile({
        type: 'asset',
        fileName: 'tutorial/index.html',
        source:
          '<!doctype html><meta charset="utf-8"><title>Spatial Graph Lab tutorial</title>' +
          '<meta http-equiv="refresh" content="0; url=01-start-here.html">' +
          '<a href="01-start-here.html">Open the tutorial</a>\n',
      });
      // Pages renumbered when "Exercise 2 in the browser" became page 06 (owner 2026-11-26): the
      // hosted app keeps the old addresses working with a redirect (build only, as above).
      const moved: Record<string, string> = {
        '06-about-the-repository': '07-about-the-repository',
        '07-install-the-tools': '08-install-the-tools',
        '08-clone-the-repository': '09-clone-the-repository',
        '09-make-your-branch': '10-make-your-branch',
        '10-toolkit-with-a-coding-agent': '11-toolkit-with-a-coding-agent',
        '11-toolkit-with-a-chat-assistant': '12-toolkit-with-a-chat-assistant',
        '12-hand-in': '13-hand-in',
        '13-keep-working-and-update': '14-keep-working-and-update',
        '14-git-basics': '15-git-basics',
        '15-help': '16-help',
      };
      for (const [from, to] of Object.entries(moved)) {
        this.emitFile({
          type: 'asset',
          fileName: `tutorial/${from}.html`,
          source: `<!doctype html><meta charset="utf-8"><title>Moved</title><meta http-equiv="refresh" content="0; url=${to}.html"><a href="${to}.html">This page moved</a>\n`,
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tutorialPages()],
  // The app's source lives in lab/ (owner 2026-11-25: the root keeps only what students need);
  // static files such as the Guide screenshots are served from lab/public/ at the site root.
  publicDir: 'lab/public',
  // The About dialog shows the package.json version (never hard-coded); see lab/app/ui/about/version.ts.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
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
    include: ['lab/core/**/*.test.ts', 'lab/app/**/*.test.ts', 'lab/student-api/**/*.test.ts'],
  },
});
