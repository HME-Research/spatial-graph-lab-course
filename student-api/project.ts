import type { AttributeSpec } from './attributes';

/**
 * One project-wide custom field: the same kinds as node type attributes, with an optional label
 * and help text shown in the app. Every node (or every edge) of every design in the project has
 * this field; a design stores only the values that differ from the defaults.
 */
export type ProjectAttributeSpec = AttributeSpec & { readonly label?: string; readonly description?: string };

export type ProjectAttributeSpecs = { readonly [key: string]: ProjectAttributeSpec };

/**
 * Project-wide custom fields (optional). `nodes` and `edges` are separate lists. Attributes that
 * node types declare in `types/` are added to `nodes` automatically, and a type's `default`
 * becomes that type's default. This is the starting point: fields added or changed in the app's
 * Attributes panel are saved by the app (in the browser, exportable as a file), never written
 * back to your TypeScript.
 */
export interface ProjectAttributes {
  readonly nodes?: ProjectAttributeSpecs;
  readonly edges?: ProjectAttributeSpecs;
}

/** `projects/<id>/project.ts` default export. The project id is the folder name. */
export interface ProjectDefinition {
  readonly name: string;
  /**
   * Design id (file name without `.json` in `designs/`) loaded at startup. Omitted: the built-in
   * example is loaded. Set but missing or invalid: an error is shown and nothing is loaded.
   */
  readonly defaultDesign?: string;
  /** Project-wide custom node and edge fields (see `ProjectAttributes`). */
  readonly attributes?: ProjectAttributes;
}

/** Identity helper: returns its argument; exists only for type checking. */
export const defineProject = (project: ProjectDefinition): ProjectDefinition => project;
