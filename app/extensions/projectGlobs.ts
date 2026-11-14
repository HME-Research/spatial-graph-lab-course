import type { ProjectGlobs, TextLoader } from './discover';

/**
 * The ONLY place where the application refers to `projects/` (checked by app/boundary.test.ts).
 * Globs are lazy: nothing is loaded until a project is activated, and then only that project.
 */
export const PROJECT_GLOBS: ProjectGlobs = {
  project: import.meta.glob('/projects/*/project.ts'),
  types: import.meta.glob(['/projects/*/types/*.ts', '!/projects/*/types/*.test.ts']),
  algorithms: import.meta.glob(['/projects/*/algorithms/*.ts', '!/projects/*/algorithms/*.test.ts']),
  designs: import.meta.glob<string>('/projects/*/designs/*.json', { query: '?raw', import: 'default' }) as Record<string, TextLoader>,
};
