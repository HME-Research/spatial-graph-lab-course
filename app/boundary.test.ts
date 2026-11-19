import { describe, expect, it } from 'vitest';

/**
 * Application layering (automated architectural check, not an access-control mechanism):
 *
 * - `document/` (v1 design document and the schema-v2 contract in `document/v2/`): pure; may
 *   import core/graph and core/spatial only.
 * - `spatial/` (v2 relationship resolution, occupancy, spatial edits, v2 commands): pure; may
 *   import `document/`, core/graph and core/spatial only.
 * - `building/` (architectural rules and geometry): pure; may also import `document/` and the
 *   pure core/viewer helpers (coordinates, selection) and `spatial/`; never React, Three.js or React Flow.
 * - `metrics/` (computed metrics, F-D): pure; may import `document/`, `spatial/`, `building/` (face
 *   resolution for façade metrics), core/graph,
 *   core/spatial and the pure core/viewer helpers (coordinates, selection); never React or Three.js.
 * - `assets/` (imported 3DM façade modules, 2026-11-17): pure; may import document, spatial,
 *   building, metrics, core/graph, core/spatial and the pure core/viewer helpers (coordinates,
 *   selection, axes — the one Z-up adapter). rhino3dm is reached only through a dynamic import.
 * - `extensions/` (project loading, definition validation, conformance, algorithm execution):
 *   pure; may import document, building, pure core modules and `@student-api`. It is the only
 *   app module that may import `@student-api` or glob `toolkits/` (`import.meta.glob`).
 * - `project/` (project file envelope and local storage, F-B): pure (its IndexedDB adapter uses
 *   only an injected `IDBFactory`); may import document, spatial, extensions (the attribute
 *   record reader), `assets/` (embedded façade validation), `display/contracts` (only that pure
 *   file of the shell-level `display/`), core/graph, core/spatial and the pure camera contract
 *   `core/viewer/three/camera`.
 * - `views/` (application visualisations): may import document, building, extensions and any core module.
 * - shell (`App`, `Workspace`, `main`, `inspector/`): composes everything.
 *
 * Lower layers never import higher ones. No relative import leaves app/; the built-in example
 * design lives in `document/examples/`.
 */
const sources = import.meta.glob<string>('./**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;
/** `import.meta.glob(...)` calls: the first argument (a string or an array of strings). */
const GLOB_CALL = /import\.meta\.glob\s*(?:<[^>]*>)?\s*\(\s*(\[[^\]]*\]|'[^']*'|"[^"]*")/g;
const STRING = /['"]([^'"]+)['"]/g;

type Layer = 'document' | 'spatial' | 'building' | 'metrics' | 'assets' | 'extensions' | 'project' | 'views' | 'shell';
const RANK: Readonly<Record<Layer, number>> = { document: 0, spatial: 1, building: 2, metrics: 3, assets: 4, extensions: 5, project: 6, views: 7, shell: 8 };

const UI_PACKAGE = /^(react|react-dom|three)(\/|$)|^@react-three\/|^@xyflow\//;

function layerOf(path: string): Layer {
  for (const layer of ['document', 'spatial', 'building', 'metrics', 'assets', 'extensions', 'project', 'views'] as const) {
    if (path.startsWith(`./${layer}/`) || path === `./${layer}`) return layer;
  }
  return 'shell';
}

const isPure = (layer: Layer) =>
  layer === 'document' || layer === 'spatial' || layer === 'building' || layer === 'metrics' || layer === 'assets' || layer === 'extensions' || layer === 'project';

/** Resolve a relative specifier against a glob key such as './views/three/x.ts'. */
function resolveRelative(file: string, specifier: string): string {
  const parts = file.split('/').slice(0, -1);
  for (const segment of specifier.split('?')[0]!.split('/')) {
    if (segment === '..') parts.pop();
    else if (segment !== '.') parts.push(segment);
  }
  return parts.join('/');
}

/** Reason the import is forbidden, or null if allowed. */
function violation(file: string, specifier: string): string | null {
  const from = layerOf(file);
  const pure = isPure(from);

  if (specifier === '@student-api' || specifier.startsWith('@student-api/')) {
    return from === 'extensions' ? null : 'only app/extensions may import the Student API';
  }

  if (specifier.startsWith('@core/')) {
    if ((from === 'document' || from === 'spatial') && !/^@core\/(graph|spatial)(\/|$)/.test(specifier))
      return `${from} may only use core/graph and core/spatial`;
    if ((from === 'building' || from === 'metrics') && !/^@core\/(graph|spatial|viewer\/(coordinates|selection))$/.test(specifier))
      return `${from} may only use pure core modules`;
    if (from === 'assets' && !/^@core\/(graph|spatial|viewer\/(coordinates|selection|axes))$/.test(specifier))
      return 'assets may only use pure core modules (and the Z-up adapter core/viewer/axes)';
    if (from === 'extensions' && !/^@core\/(graph|spatial|viewer\/(appearance|coordinates|selection))$/.test(specifier))
      return 'extensions may only use pure core modules';
    if (from === 'project' && !/^@core\/(graph|spatial|viewer\/three\/camera)$/.test(specifier))
      return 'project may only use core/graph, core/spatial and the camera contract';
    return null;
  }

  let target: string | null = null;
  if (specifier.startsWith('@app/')) target = `./${specifier.slice('@app/'.length)}`;
  else if (specifier.startsWith('.')) {
    target = resolveRelative(file, specifier);
    if (!target.startsWith('./')) return `leaves app/ (${target})`;
  }

  if (target === null) {
    // A package.
    return pure && UI_PACKAGE.test(specifier) ? `pure ${from} layer imports UI package ${specifier}` : null;
  }
  if (pure && target.endsWith('.css')) return `pure ${from} layer imports CSS`;
  if (from === 'project' && target === './display/contracts') return null;
  const to = layerOf(target);
  return RANK[to] > RANK[from] ? `${from} imports higher layer ${to} (${specifier})` : null;
}

/**
 * Reason an `import.meta.glob` pattern is forbidden, or null. Globs are invisible to the
 * specifier check, so they are checked separately: only app/extensions may glob `/toolkits/`,
 * and every other glob must stay inside app/.
 */
function globViolation(file: string, pattern: string): string | null {
  const p = pattern.startsWith('!') ? pattern.slice(1) : pattern;
  if (p.startsWith('/toolkits/')) return layerOf(file) === 'extensions' ? null : 'only app/extensions may glob toolkits/';
  if (!p.startsWith('.')) return `glob outside app/ (${pattern})`;
  return resolveRelative(file, p).startsWith('./') ? null : `glob leaves app/ (${pattern})`;
}

const globPatterns = (text: string): string[] =>
  [...text.matchAll(GLOB_CALL)].flatMap((m) => [...m[1]!.matchAll(STRING)].map((s) => s[1]!));

describe('application layering', () => {
  it('finds source files in every layer', () => {
    const keys = Object.keys(sources);
    for (const dir of ['./document/', './spatial/', './building/', './metrics/', './assets/', './extensions/', './project/', './views/', './inspector/']) {
      expect(keys.some((k) => k.startsWith(dir))).toBe(true);
    }
    expect(keys).toContain('./App.tsx');
  });

  it('flags upward, UI and escaping imports (self-check)', () => {
    expect(violation('./document/x.ts', '@app/building')).not.toBeNull();
    expect(violation('./document/v2/x.ts', '@app/spatial')).not.toBeNull();
    expect(violation('./spatial/x.ts', '@app/building')).not.toBeNull();
    expect(violation('./spatial/x.ts', 'three')).not.toBeNull();
    expect(violation('./spatial/x.ts', '@core/viewer/coordinates')).not.toBeNull();
    expect(violation('./spatial/x.ts', '@app/document/v2')).toBeNull();
    expect(violation('./building/x.ts', '@app/spatial')).toBeNull();
    expect(violation('./views/contracts.ts', '@app/spatial')).toBeNull();
    expect(violation('./document/x.ts', '@core/viewer/selection')).not.toBeNull();
    expect(violation('./building/x.ts', '@app/views/contracts')).not.toBeNull();
    expect(violation('./building/x.ts', '../views/registry')).not.toBeNull();
    expect(violation('./building/x.ts', 'three')).not.toBeNull();
    expect(violation('./building/x.ts', '@react-three/fiber')).not.toBeNull();
    expect(violation('./building/x.ts', '@core/viewer/three/SceneCanvas')).not.toBeNull();
    expect(violation('./building/x.ts', '@app/extensions')).not.toBeNull();
    expect(violation('./building/x.ts', '@app/metrics/registry')).not.toBeNull();
    expect(violation('./metrics/x.ts', 'react')).not.toBeNull();
    expect(violation('./metrics/x.ts', '@app/views/contracts')).not.toBeNull();
    expect(violation('./metrics/x.ts', '@core/viewer/three/SceneCanvas')).not.toBeNull();
    expect(violation('./metrics/x.ts', '@app/spatial')).toBeNull();
    expect(violation('./metrics/x.ts', '@core/viewer/coordinates')).toBeNull();
    expect(violation('./views/x.ts', '@app/metrics/registry')).toBeNull();
    expect(violation('./views/x.ts', '@app/inspector/Inspector')).not.toBeNull();
    expect(violation('./views/graph2d/x.ts', '../../App')).not.toBeNull();
    expect(violation('./views/x.ts', '../../toolkits/a/b.ts')).not.toBeNull();
    expect(violation('./views/x.ts', '@student-api')).not.toBeNull();
    expect(violation('./document/x.ts', '@student-api')).not.toBeNull();
    expect(violation('./extensions/x.ts', '@app/views/contracts')).not.toBeNull();
    expect(violation('./extensions/x.ts', 'react')).not.toBeNull();
    expect(violation('./extensions/x.ts', '@core/viewer/three/SceneCanvas')).not.toBeNull();
    expect(violation('./extensions/x.ts', '../../toolkits/house/types/kitchen')).not.toBeNull();
    expect(violation('./extensions/x.ts', '@student-api')).toBeNull();
    expect(violation('./extensions/x.ts', '@app/building')).toBeNull();
    expect(violation('./extensions/x.ts', '@core/viewer/appearance')).toBeNull();
    expect(violation('./views/x.ts', '@app/extensions')).toBeNull();
    expect(violation('./building/x.ts', '@app/document')).toBeNull();
    expect(violation('./building/x.ts', '@core/viewer/coordinates')).toBeNull();
    expect(violation('./document/x.test.ts', '../../student/designs/two-storey-example.json?raw')).not.toBeNull();
    expect(violation('./document/x.test.ts', './examples/house.json?raw')).toBeNull();
    expect(violation('./views/three/x.test.ts', '../../document/test-designs/two-storey.json')).toBeNull();
    expect(violation('./views/x.tsx', '@react-three/fiber')).toBeNull();
    expect(violation('./inspector/x.tsx', '@app/views/graph2d/diagram')).toBeNull();
    expect(violation('./project/x.ts', '@app/display/contracts')).toBeNull();
    expect(violation('./project/x.ts', '@app/display/DisplayPanel')).not.toBeNull();
    expect(violation('./project/x.ts', '@app/session/projectAttributeStore')).not.toBeNull();
    expect(violation('./project/x.ts', '@app/extensions/projectAttributes')).toBeNull();
    expect(violation('./project/x.ts', '@app/spatial')).toBeNull();
    expect(violation('./project/x.ts', '@core/viewer/three/camera')).toBeNull();
    expect(violation('./project/x.ts', '@core/viewer/three/SceneCanvas')).not.toBeNull();
    expect(violation('./project/x.ts', 'react')).not.toBeNull();
    expect(violation('./project/x.ts', '@app/views/contracts')).not.toBeNull();
    expect(violation('./extensions/x.ts', '@app/project')).not.toBeNull();
    // assets (imported 3DM façades): pure, below extensions/project/views.
    expect(violation('./assets/x.ts', '@app/building')).toBeNull();
    expect(violation('./assets/x.ts', '@core/viewer/axes')).toBeNull();
    expect(violation('./assets/x.ts', 'rhino3dm')).toBeNull();
    expect(violation('./assets/x.ts', 'three')).not.toBeNull();
    expect(violation('./assets/x.ts', 'react')).not.toBeNull();
    expect(violation('./assets/x.ts', '@app/project')).not.toBeNull();
    expect(violation('./assets/x.ts', '@app/views/contracts')).not.toBeNull();
    expect(violation('./assets/x.ts', '@core/viewer/three/SceneCanvas')).not.toBeNull();
    expect(violation('./project/x.ts', '@app/assets')).toBeNull();
    expect(violation('./building/x.ts', '@app/assets')).not.toBeNull();
  });

  it('flags globs into toolkits/ outside extensions and globs leaving app/ (self-check)', () => {
    expect(globViolation('./App.tsx', '/toolkits/*/toolkit.ts')).not.toBeNull();
    expect(globViolation('./views/x.ts', '/toolkits/**/*.json')).not.toBeNull();
    expect(globViolation('./views/x.ts', '../../toolkits/*/types/*.ts')).not.toBeNull();
    expect(globViolation('./views/x.ts', '/core/**/*.ts')).not.toBeNull();
    expect(globViolation('./extensions/toolkitGlobs.ts', '/toolkits/*/types/*.ts')).toBeNull();
    expect(globViolation('./extensions/toolkitGlobs.ts', '!/toolkits/*/types/*.test.ts')).toBeNull();
    expect(globViolation('./boundary.test.ts', './**/*.{ts,tsx}')).toBeNull();
    const call = ['import', 'meta', 'glob'].join('.'); // built so this file's own scan does not see it
    expect(globPatterns(`${call}<string>(['/a/*.ts', '!/a/*.test.ts'], {})`)).toEqual(['/a/*.ts', '!/a/*.test.ts']);
    expect(globPatterns(`${call}('./x/*.json')`)).toEqual(['./x/*.json']);
  });

  it('globs toolkits/ only from app/extensions/toolkitGlobs.ts (outside tests)', () => {
    const globbing = Object.entries(sources)
      .filter(([file]) => !file.endsWith('.test.ts'))
      .filter(([, text]) => globPatterns(text).some((p) => p.replace(/^!/, '').startsWith('/toolkits/')))
      .map(([file]) => file);
    expect(globbing).toEqual(['./extensions/toolkitGlobs.ts']);
  });

  it.each(Object.entries(sources))('%s respects the application layering', (file, text) => {
    const problems = [
      ...[...text.matchAll(SPECIFIER)].map((m) => m[1]!).map((s) => [s, violation(file, s)] as const),
      ...globPatterns(text).map((p) => [`glob ${p}`, globViolation(file, p)] as const),
    ].filter(([, reason]) => reason !== null);
    expect(problems, `forbidden imports in app/${file.slice(2)}`).toEqual([]);
  });
});
