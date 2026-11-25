import { describe, expect, it } from 'vitest';

/**
 * Reusable grid mathematics must stay independent: its source may only import sibling files in
 * core/spatial (tests may also import vitest). No graph model, document, architecture, app,
 * viewer, student code, Zod, React, Three.js or any other package.
 */
const sources = import.meta.glob<string>('./**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

describe('core/spatial dependency boundary', () => {
  it('finds the spatial source files', () => {
    expect(Object.keys(sources)).toEqual(expect.arrayContaining(['./index.ts', './grid.ts']));
  });

  it.each(Object.entries(sources))('%s imports only sibling core/spatial modules', (file, text) => {
    const specifiers = [...text.matchAll(SPECIFIER)].map((m) => m[1]!);
    const allowed = (s: string) =>
      (s.startsWith('./') && !s.slice(2).includes('..')) || (file.endsWith('.test.ts') && s === 'vitest');
    expect(specifiers.filter((s) => !allowed(s)), `forbidden imports in ${file}`).toEqual([]);
  });
});
