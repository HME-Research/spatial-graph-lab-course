import type { ToolkitGlobs, TextLoader, UrlLoader } from './discover';

/**
 * The ONLY place where the application refers to `toolkits/` (checked by app/boundary.test.ts).
 * Globs are lazy: nothing is loaded until a toolkit is activated, and then only that toolkit.
 */
export const TOOLKIT_GLOBS: ToolkitGlobs = {
  toolkit: import.meta.glob('/toolkits/*/toolkit.ts'),
  functions: import.meta.glob(['/toolkits/*/functions/*.ts', '!/toolkits/*/functions/*.test.ts']),
  algorithms: import.meta.glob(['/toolkits/*/algorithms/*.ts', '!/toolkits/*/algorithms/*.test.ts']),
  designs: import.meta.glob<string>('/toolkits/*/designs/*.json', { query: '?raw', import: 'default' }) as Record<string, TextLoader>,
  // Façade files (2026-11-20): only a URL module per file, loaded lazily; the file itself is
  // fetched when an example that uses it is opened, and is never part of a JavaScript bundle.
  assets: import.meta.glob<string>('/toolkits/*/assets/*.3dm', { query: '?url', import: 'default' }) as Record<string, UrlLoader>,
};

/**
 * The reference toolkit's text files (`toolkits/house/`, without tests and façade files), as text,
 * for the toolkit kit the Guide builds on download (`app/ui/guide/aiKits.ts`, 2026-11-24). Lazy:
 * nothing is loaded until the kit is built. Keys are paths such as `/toolkits/house/toolkit.ts`.
 */
export const REFERENCE_TOOLKIT_ID = 'house';
export const REFERENCE_TOOLKIT_FILES: Readonly<Record<string, TextLoader>> = import.meta.glob<string>(
  ['/toolkits/house/**/*.{ts,json,md}', '!/toolkits/house/**/*.test.ts'],
  { query: '?raw', import: 'default' },
) as Record<string, TextLoader>;
