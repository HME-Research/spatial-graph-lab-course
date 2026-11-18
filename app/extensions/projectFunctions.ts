import type { NodeTypeDefinition } from '@student-api';
import type { ActiveToolkit, RegisteredNodeType } from './activate';

/**
 * Project functions (UI refinement 2026-11-17): node types a student adds in the browser, stored in
 * the project file (`settings.functions`), beside the toolkit's `types/` definitions.
 *
 * They are merged into `ActiveToolkit.nodeTypes` as ordinary, valid registered types, so every
 * consumer (Function picker, conformance, colours, façades, the Student API's type checks) treats
 * them exactly like a code-defined type that declares no façade and no attributes: the fallback
 * colour and façade apply. A code definition always wins over a project function with the same id
 * (that function is ignored, never duplicated). Pure; the input project is never changed.
 */

/** `file` of a merged project function (shown where a code type shows its source file). */
export const PROJECT_FUNCTIONS_FILE = 'project functions';

export interface ProjectFunctionInput {
  readonly id: string;
  readonly label: string;
}

export const isProjectFunction = (type: Pick<RegisteredNodeType, 'file'>): boolean => type.file === PROJECT_FUNCTIONS_FILE;

/**
 * `hidden`: ids of toolkit functions removed from this project; they are left out of `nodeTypes`
 * (a node that still uses one is then reported as using an undefined type, like any unknown id).
 */
export function withProjectFunctions(project: ActiveToolkit, functions: readonly ProjectFunctionInput[] | undefined, hidden: readonly string[] = []): ActiveToolkit {
  if ((!functions || functions.length === 0) && hidden.length === 0) return project;
  const removed = new Set(hidden);
  const kept = removed.size === 0 ? project.nodeTypes : project.nodeTypes.filter((t) => !removed.has(t.id));
  const taken = new Set(project.nodeTypes.map((t) => t.id));
  const added: RegisteredNodeType[] = [];
  for (const f of functions ?? []) {
    if (taken.has(f.id)) continue;
    taken.add(f.id);
    const definition: NodeTypeDefinition = Object.freeze({ id: f.id, label: f.label });
    added.push(Object.freeze({ id: f.id, file: PROJECT_FUNCTIONS_FILE, definition, status: Object.freeze({ ok: true as const }) }));
  }
  return added.length === 0 && kept === project.nodeTypes ? project : { ...project, nodeTypes: [...kept, ...added] };
}
