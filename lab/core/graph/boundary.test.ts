import { describe, expect, it } from 'vitest';

/**
 * The generic graph core must stay independent: its source may only import sibling files in
 * core/graph (tests may also import vitest). No spatial, architecture, app, viewer, student,
 * React, Three.js, Zod or any other package.
 */
const sources = import.meta.glob<string>('./**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

describe('generic graph core dependency boundary', () => {
  it('finds the core source files', () => {
    expect(Object.keys(sources)).toEqual(expect.arrayContaining(['./index.ts', './operations.ts', './types.ts']));
  });

  it.each(Object.entries(sources))('%s imports only sibling core/graph modules', (file, text) => {
    const specifiers = [...text.matchAll(SPECIFIER)].map((m) => m[1]!);
    const allowed = (s: string) =>
      (s.startsWith('./') && !s.slice(2).includes('..')) || (file.endsWith('.test.ts') && s === 'vitest');
    expect(specifiers.filter((s) => !allowed(s)), `forbidden imports in ${file}`).toEqual([]);
  });
});
