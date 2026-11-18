import type { ToolkitGlobs, TextLoader } from './discover';

/**
 * The ONLY place where the application refers to `toolkits/` (checked by app/boundary.test.ts).
 * Globs are lazy: nothing is loaded until a toolkit is activated, and then only that toolkit.
 */
export const TOOLKIT_GLOBS: ToolkitGlobs = {
  toolkit: import.meta.glob('/toolkits/*/toolkit.ts'),
  types: import.meta.glob(['/toolkits/*/types/*.ts', '!/toolkits/*/types/*.test.ts']),
  algorithms: import.meta.glob(['/toolkits/*/algorithms/*.ts', '!/toolkits/*/algorithms/*.test.ts']),
  designs: import.meta.glob<string>('/toolkits/*/designs/*.json', { query: '?raw', import: 'default' }) as Record<string, TextLoader>,
};
