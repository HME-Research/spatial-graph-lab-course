import { describe, expect, it } from 'vitest';

/**
 * Toolkit code may import only `@student-api` and files of its own toolkit (relative paths that
 * stay inside `toolkits/<id>/`). No packages, no application or core internals, no other
 * toolkits. Lives in app/ (owner-maintained) so it cannot be removed from a toolkit folder.
 * An automated architectural check, not an access-control mechanism.
 */
const sources = import.meta.glob<string>('/toolkits/**/*.{ts,tsx,js,mjs}', { query: '?raw', import: 'default', eager: true });

/**
 * Static `import`/`export … from`, side-effect `import '…'`, dynamic `import(…)` and `require(…)`.
 * `from` counts only inside an import/export statement, because student code often contains text
 * such as `from "${start}"` in messages.
 */
const SPECIFIER =
  /^\s*(?:import|export)\b[^;]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]/gm;

const specifiers = (text: string): string[] => [...text.matchAll(SPECIFIER)].map((m) => (m[1] ?? m[2] ?? m[3] ?? m[4])!);

/** Resolve a relative specifier against '/toolkits/<id>/…/file.ts'. */
function resolveRelative(file: string, specifier: string): string {
  const parts = file.split('/').slice(0, -1);
  for (const segment of specifier.split('/')) {
    if (segment === '..') parts.pop();
    else if (segment !== '.') parts.push(segment);
  }
  return parts.join('/');
}

function violation(file: string, specifier: string): string | null {
  if (specifier === '@student-api') return null;
  if (specifier.startsWith('.')) {
    const root = file.split('/').slice(0, 3).join('/'); // '/toolkits/<id>'
    return resolveRelative(file, specifier).startsWith(`${root}/`) ? null : `leaves its toolkit (${specifier})`;
  }
  return `imports ${specifier}; toolkit code may import only @student-api and its own files`;
}

describe('toolkit import boundary', () => {
  it('finds the example toolkit', () => {
    expect(Object.keys(sources)).toContain('/toolkits/example-gallery/toolkit.ts');
  });

  it('flags forbidden imports (self-check)', () => {
    const f = '/toolkits/a/algorithms/x.ts';
    expect(violation(f, '@student-api')).toBeNull();
    expect(violation(f, '../types/gallery')).toBeNull();
    expect(violation(f, '../../b/types/gallery')).not.toBeNull();
    expect(violation(f, '../../../app/document')).not.toBeNull();
    expect(violation(f, '@app/document')).not.toBeNull();
    expect(violation(f, '@core/graph')).not.toBeNull();
    expect(violation(f, 'zod')).not.toBeNull();
    expect(violation(f, 'react')).not.toBeNull();
    const sample = [
      "import { a } from '@student-api';",
      'import {',
      '  b,',
      "} from 'zod';",
      "import './side-effect';",
      "const m = `rooms from ${'x'}`;",
      "const lazy = import('left-pad');",
    ].join('\n');
    expect(specifiers(sample)).toEqual(['@student-api', 'zod', './side-effect', 'left-pad']);
  });

  it.each(Object.entries(sources))('%s imports only @student-api and its own toolkit', (file, text) => {
    const problems = specifiers(text).filter((s) => violation(file, s) !== null);
    expect(problems, `forbidden imports in ${file}`).toEqual([]);
  });
});
