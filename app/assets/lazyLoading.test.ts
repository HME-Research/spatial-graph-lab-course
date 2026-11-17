import { describe, expect, it } from 'vitest';

/**
 * rhino3dm (glue + ~2.6 MB WASM) must stay out of the main bundle: it is loaded only when a
 * student imports a .3dm. Statically checked here; the production build is checked by hand
 * (dist/assets: the WASM is referenced only by the lazy `browser-*` chunk).
 */
const sources = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.ts'], { query: '?raw', import: 'default', eager: true });

const STATIC_IMPORT = /^\s*import\s+(?!type\b)[^;]*?from\s*['"]([^'"]+)['"]/gm;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Source without comments (so documentation that mentions an import is not counted). */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const staticImports = (text: string) => [...code(text).matchAll(STATIC_IMPORT)].map((m) => m[1]!);
const dynamicImports = (text: string) => [...code(text).matchAll(DYNAMIC_IMPORT)].map((m) => m[1]!);

describe('3DM reader is lazily loaded', () => {
  it('finds the app sources', () => {
    expect(Object.keys(sources)).toContain('./rhino/browser.ts');
    expect(Object.keys(sources).some((k) => k.startsWith('../designer/'))).toBe(true);
  });

  it('only the browser entry statically imports rhino3dm (its WASM URL); the loader imports it dynamically', () => {
    const statically = Object.entries(sources)
      .filter(([, text]) => staticImports(text).some((s) => s === 'rhino3dm' || s.startsWith('rhino3dm/')))
      .map(([file]) => file);
    expect(statically).toEqual(['./rhino/browser.ts']);
    const dynamically = Object.entries(sources)
      .filter(([, text]) => dynamicImports(text).includes('rhino3dm'))
      .map(([file]) => file);
    expect(dynamically).toEqual(['./rhino/loader.ts']);
  });

  it('nothing imports the browser entry, the loader or the reader statically (outside the lazy entry itself)', () => {
    const lazyOnly = /(^|\/)(rhino\/(browser|loader|reader)|importFacade)$/;
    const offenders = Object.entries(sources)
      .filter(([file]) => !file.startsWith('./rhino/') && file !== './importFacade.ts')
      .filter(([, text]) => staticImports(text).some((s) => lazyOnly.test(s.replace(/\.tsx?$/, ''))))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
    const loaders = Object.entries(sources)
      .filter(([, text]) => dynamicImports(text).includes('@app/assets/rhino/browser'))
      .map(([file]) => file);
    expect(loaders).toEqual(['../designer/FacadeLibraryPanel.tsx']);
  });

  it('the assets barrel does not re-export the import pipeline', () => {
    const barrel = sources['./index.ts']!;
    expect(barrel).not.toMatch(/from '\.\/(importFacade|rhino\/)/);
  });
});
