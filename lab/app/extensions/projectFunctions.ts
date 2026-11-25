import type { FunctionDefinition } from '@student-api';
import type { ActiveToolkit, RegisteredFunction } from './activate';

/**
 * Project functions (UI refinement 2026-11-17): node types a student adds in the browser, stored in
 * the project file (`settings.functions`), beside the toolkit's `functions/` definitions.
 *
 * They are merged into `ActiveToolkit.functions` as ordinary, valid registered types, so every
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

export const isProjectFunction = (type: Pick<RegisteredFunction, 'file'>): boolean => type.file === PROJECT_FUNCTIONS_FILE;

/** A project function whose id a toolkit function also defines (the toolkit gained it later). */
export interface FunctionClash {
  readonly id: string;
  /** The student's own name for it. */
  readonly label: string;
  /** The toolkit function's name (its id when its definition is invalid). */
  readonly toolkitLabel: string;
}

/**
 * Project functions whose id a toolkit function (valid or not, removed from the project or not)
 * also has. The toolkit's definition wins (`withProjectFunctions`), so the student's function is
 * not offered until the clash is settled (`resolveFunctionClash` in app/session). Pure.
 */
export function functionClashes(toolkit: Pick<ActiveToolkit, 'functions'> | null, functions: readonly ProjectFunctionInput[] | undefined): FunctionClash[] {
  if (!toolkit || !functions || functions.length === 0) return [];
  const own = new Map(toolkit.functions.filter((t) => !isProjectFunction(t)).map((t) => [t.id, t] as const));
  return functions.flatMap((f) => {
    const t = own.get(f.id);
    if (!t) return [];
    const label = (t.definition as { label?: unknown }).label;
    return [{ id: f.id, label: f.label, toolkitLabel: typeof label === 'string' && label.trim() !== '' ? label : t.id }];
  });
}

/**
 * `hidden`: ids of toolkit functions removed from this project; they are left out of `functions`
 * (a node that still uses one is then reported as using an undefined type, like any unknown id).
 */
export function withProjectFunctions(project: ActiveToolkit, functions: readonly ProjectFunctionInput[] | undefined, hidden: readonly string[] = []): ActiveToolkit {
  if ((!functions || functions.length === 0) && hidden.length === 0) return project;
  const removed = new Set(hidden);
  const kept = removed.size === 0 ? project.functions : project.functions.filter((t) => !removed.has(t.id));
  const taken = new Set(project.functions.map((t) => t.id));
  const added: RegisteredFunction[] = [];
  for (const f of functions ?? []) {
    if (taken.has(f.id)) continue;
    taken.add(f.id);
    const definition: FunctionDefinition = Object.freeze({ id: f.id, label: f.label });
    added.push(Object.freeze({ id: f.id, file: PROJECT_FUNCTIONS_FILE, definition, status: Object.freeze({ ok: true as const }) }));
  }
  return added.length === 0 && kept === project.functions ? project : { ...project, functions: [...kept, ...added] };
}
