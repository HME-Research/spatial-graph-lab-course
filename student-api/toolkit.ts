import type { AttributeSpec } from './attributes';

/**
 * One custom field declared by the toolkit: the same kinds as a function's custom attributes, with an
 * optional label and help text shown in the app. Every node (or every edge) of every design in a
 * project made with this toolkit has this field; a design stores only the values that differ from
 * the defaults.
 */
export type ToolkitAttributeSpec = AttributeSpec & { readonly label?: string; readonly description?: string };

export type ToolkitAttributeSpecs = { readonly [key: string]: ToolkitAttributeSpec };

/**
 * Custom fields the toolkit declares (optional). `nodes` and `edges` are separate lists. Attributes
 * that functions declare in `functions/` are added to `nodes` automatically, and a function's `default`
 * becomes that function's default. This is the starting point of each new project's attributes:
 * fields added or changed in the app's Attributes panel are saved in the project, never written
 * back to your TypeScript.
 */
export interface ToolkitAttributes {
  readonly nodes?: ToolkitAttributeSpecs;
  readonly edges?: ToolkitAttributeSpecs;
}

/** `toolkits/<id>/toolkit.ts` default export. The toolkit id is the folder name. */
export interface ToolkitDefinition {
  readonly name: string;
  /**
   * Design id (file name without `.json` in `designs/`). A project created with this toolkit takes
   * its Building settings (its graph starts empty, with the toolkit's custom attributes), and
   * `npm run check:toolkit` runs your algorithms on it. Omitted: the built-in example's settings are
   * used. Set but missing or invalid: an error is shown and the project is not created.
   */
  readonly defaultDesign?: string;
  /** Custom node and edge fields for projects made with this toolkit (see `ToolkitAttributes`). */
  readonly custom?: ToolkitAttributes;
}

/** Identity helper: returns its argument; exists only for type checking. */
export const defineToolkit = (toolkit: ToolkitDefinition): ToolkitDefinition => toolkit;
