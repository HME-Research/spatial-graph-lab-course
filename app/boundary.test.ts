import { describe, expect, it } from 'vitest';

/**
 * Application layering (automated architectural check, not an access-control mechanism):
 *
 * - `document/` (v1 design document): pure; may import core/graph and core/spatial only.
 * - `building/` (architectural rules and geometry): pure; may also import `document/` and the
 *   pure core/viewer helpers (coordinates, selection), never React, Three.js or React Flow.
 * - `views/` (application visualisations): may import document, building and any core module.
 * - shell (`App`, `Workspace`, `main`, `inspector/`): composes everything.
 *
 * Lower layers never import higher ones. Nothing in app/ imports projects/; student/ is only read
 * for example design JSON files.
 */
const sources = import.meta.glob<string>('./**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

type Layer = 'document' | 'building' | 'views' | 'shell';
const RANK: Readonly<Record<Layer, number>> = { document: 0, building: 1, views: 2, shell: 3 };

const UI_PACKAGE = /^(react|react-dom|three)(\/|$)|^@react-three\/|^@xyflow\//;

function layerOf(path: string): Layer {
  if (path.startsWith('./document/') || path === './document') return 'document';
  if (path.startsWith('./building/') || path === './building') return 'building';
  if (path.startsWith('./views/') || path === './views') return 'views';
  return 'shell';
}

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
  const pure = from === 'document' || from === 'building';

  if (specifier.startsWith('@core/')) {
    if (from === 'document' && !/^@core\/(graph|spatial)(\/|$)/.test(specifier)) return 'document may only use core/graph and core/spatial';
    if (from === 'building' && !/^@core\/(graph|spatial|viewer\/(coordinates|selection))$/.test(specifier))
      return 'building may only use pure core modules';
    return null;
  }

  let target: string | null = null;
  if (specifier.startsWith('@app/')) target = `./${specifier.slice('@app/'.length)}`;
  else if (specifier.startsWith('.')) {
    target = resolveRelative(file, specifier);
    if (!target.startsWith('./')) {
      // Outside app/: only example design JSON under student/designs is allowed.
      return /^student\/designs\/[^/]+\.json$/.test(target) ? null : `leaves app/ (${target})`;
    }
  }

  if (target === null) {
    // A package.
    return pure && UI_PACKAGE.test(specifier) ? `pure ${from} layer imports UI package ${specifier}` : null;
  }
  if (pure && target.endsWith('.css')) return `pure ${from} layer imports CSS`;
  const to = layerOf(target);
  return RANK[to] > RANK[from] ? `${from} imports higher layer ${to} (${specifier})` : null;
}

describe('application layering', () => {
  it('finds source files in every layer', () => {
    const keys = Object.keys(sources);
    for (const dir of ['./document/', './building/', './views/', './inspector/']) {
      expect(keys.some((k) => k.startsWith(dir))).toBe(true);
    }
    expect(keys).toContain('./App.tsx');
  });

  it('flags upward, UI and escaping imports (self-check)', () => {
    expect(violation('./document/x.ts', '@app/building')).not.toBeNull();
    expect(violation('./document/x.ts', '@core/viewer/selection')).not.toBeNull();
    expect(violation('./building/x.ts', '@app/views/contracts')).not.toBeNull();
    expect(violation('./building/x.ts', '../views/registry')).not.toBeNull();
    expect(violation('./building/x.ts', 'three')).not.toBeNull();
    expect(violation('./building/x.ts', '@react-three/fiber')).not.toBeNull();
    expect(violation('./building/x.ts', '@core/viewer/three/SceneCanvas')).not.toBeNull();
    expect(violation('./views/x.ts', '@app/inspector/Inspector')).not.toBeNull();
    expect(violation('./views/graph2d/x.ts', '../../App')).not.toBeNull();
    expect(violation('./views/x.ts', '../../projects/a/b.ts')).not.toBeNull();
    expect(violation('./building/x.ts', '@app/document')).toBeNull();
    expect(violation('./building/x.ts', '@core/viewer/coordinates')).toBeNull();
    expect(violation('./document/x.test.ts', '../../student/designs/two-storey-example.json?raw')).toBeNull();
    expect(violation('./views/x.tsx', '@react-three/fiber')).toBeNull();
    expect(violation('./inspector/x.tsx', '@app/views/graph2d/diagram')).toBeNull();
  });

  it.each(Object.entries(sources))('%s respects the application layering', (file, text) => {
    const problems = [...text.matchAll(SPECIFIER)]
      .map((m) => m[1]!)
      .map((s) => [s, violation(file, s)] as const)
      .filter(([, reason]) => reason !== null);
    expect(problems, `forbidden imports in app/${file.slice(2)}`).toEqual([]);
  });
});
