/** `projects/<id>/project.ts` default export. The project id is the folder name. */
export interface ProjectDefinition {
  readonly name: string;
  /**
   * Design id (file name without `.json` in `designs/`) loaded at startup. Omitted: the built-in
   * example is loaded. Set but missing or invalid: an error is shown and nothing is loaded.
   */
  readonly defaultDesign?: string;
}

/** Identity helper: returns its argument; exists only for type checking. */
export const defineProject = (project: ProjectDefinition): ProjectDefinition => project;
