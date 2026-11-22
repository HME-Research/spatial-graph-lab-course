import type { ActiveToolkit } from './activate';

/**
 * Function names (22 November 2026): the ONE resolver every view, legend, tooltip and table uses
 * for a function's readable name, so a rename in the Functions dialog shows everywhere at once.
 * A function's id is fixed when it is created (from its first name) and never changes; only its
 * label does, so nothing a student sees should print the id where a name is meant.
 * Resolution: the label of the active project's definition (project functions included; a broken
 * definition's label only if it is text) → the id itself (unknown function, or no project). Pure.
 */
export type FunctionName = (functionId: string) => string;

/** Without a project: the id is the only name there is. */
export const ID_AS_FUNCTION_NAME: FunctionName = (functionId) => functionId;

/** Resolver for one project (memoised per function id). */
export function functionNameResolver(project: ActiveToolkit | null): FunctionName {
  if (!project) return ID_AS_FUNCTION_NAME;
  const cache = new Map<string, string>();
  return (functionId) => {
    let name = cache.get(functionId);
    if (name === undefined) {
      const type = project.functions.find((t) => t.id === functionId);
      const label = type?.status.ok ? type.definition.label : (type?.definition as { label?: unknown } | undefined)?.label;
      name = typeof label === 'string' && label.trim() !== '' ? label : functionId;
      cache.set(functionId, name);
    }
    return name;
  };
}
