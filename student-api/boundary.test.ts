import { describe, expect, it } from 'vitest';

/**
 * The Student API is a thin, stable contract. Its source may import only sibling student-api
 * files and the generic `@core/graph` / `@core/spatial` entry points (tests may also import
 * vitest and the application's extension runtime). Never app/, toolkits/, Zod, React or Three.js.
 * An automated architectural check, not an access-control mechanism.
 */
const sources = import.meta.glob<string>('./**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

const allowed = (file: string, s: string): boolean =>
  (s.startsWith('./') && !s.slice(2).includes('..')) ||
  s === '@core/graph' ||
  s === '@core/spatial' ||
  (file.endsWith('.test.ts') && s === 'vitest');

describe('student-api dependency boundary', () => {
  it('finds the Student API source files', () => {
    expect(Object.keys(sources)).toEqual(
      expect.arrayContaining(['./index.ts', './attributes.ts', './graph.ts', './spatial.ts', './algorithms.ts']),
    );
  });

  it('flags application, project and package imports (self-check)', () => {
    expect(allowed('./graph.ts', '@app/document')).toBe(false);
    expect(allowed('./graph.ts', '../toolkits/x/types/a')).toBe(false);
    expect(allowed('./graph.ts', 'zod')).toBe(false);
    expect(allowed('./graph.ts', '@core/viewer/appearance')).toBe(false);
    expect(allowed('./graph.ts', '@core/graph')).toBe(true);
  });

  it.each(Object.entries(sources))('%s imports only core/graph, core/spatial and siblings', (file, text) => {
    const specifiers = [...text.matchAll(SPECIFIER)].map((m) => m[1]!);
    expect(specifiers.filter((s) => !allowed(file, s)), `forbidden imports in student-api/${file.slice(2)}`).toEqual([]);
  });
});
