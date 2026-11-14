import { describe, expect, it } from 'vitest';

/**
 * Reusable core modules must never depend on the application, student work or projects.
 * Every import in core/** must either be a package, an `@core/*` alias, or a relative path that
 * stays inside core/. Stricter per-module rules live in core/graph and core/spatial.
 *
 * This is an automated architectural check, not an access-control mechanism.
 */
const sources = import.meta.glob<string>('./**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

/** Resolve a relative specifier against a glob key such as './viewer/three/x.ts'. */
function resolveRelative(file: string, specifier: string): string {
  const parts = file.split('/').slice(0, -1); // ['.', 'viewer', 'three']
  for (const segment of specifier.split('?')[0]!.split('/')) {
    if (segment === '..') parts.pop();
    else if (segment !== '.') parts.push(segment);
  }
  return parts.join('/');
}

/** Reason the import is forbidden, or null if allowed. */
function violation(file: string, specifier: string): string | null {
  if (specifier.startsWith('@app/') || specifier === '@app') return 'imports the application';
  if (specifier.startsWith('@student-api')) return 'imports the Student API';
  if (specifier.startsWith('.')) {
    // Anything outside core/ (app/, student/, projects/, root files) is forbidden.
    const target = resolveRelative(file, specifier);
    if (!(target === '.' || target.startsWith('./'))) return `relative path leaves core/ (${target})`;
  }
  return null;
}

describe('core dependency boundary', () => {
  it('finds core source files in every module', () => {
    const keys = Object.keys(sources);
    for (const dir of ['./graph/', './spatial/', './viewer/']) expect(keys.some((k) => k.startsWith(dir))).toBe(true);
  });

  it('flags application, student and escaping imports (self-check)', () => {
    expect(violation('./viewer/x.ts', '@app/document')).not.toBeNull();
    expect(violation('./viewer/x.ts', '../../app/document')).not.toBeNull();
    expect(violation('./graph/x.ts', '@student-api')).not.toBeNull();
    expect(violation('./graph/x.ts', '../../projects/p/types/a')).not.toBeNull();
    expect(violation('./viewer/three/x.ts', '../../../student/designs/a.json')).not.toBeNull();
    expect(violation('./viewer/three/x.ts', '../coordinates')).toBeNull();
    expect(violation('./viewer/x.ts', '@core/spatial')).toBeNull();
    expect(violation('./viewer/x.ts', 'three')).toBeNull();
  });

  it.each(Object.entries(sources))('%s never imports app/, student/ or projects/', (file, text) => {
    const problems = [...text.matchAll(SPECIFIER)]
      .map((m) => m[1]!)
      .map((s) => [s, violation(file, s)] as const)
      .filter(([, reason]) => reason !== null);
    expect(problems, `forbidden imports in core/${file.slice(2)}`).toEqual([]);
  });
});
