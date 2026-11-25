import type { FacadeProvider, FacadeSpec } from '@app/building';
import type { DesignDocumentV2 } from '@app/document';

/** Only node ids and types are read. */
type TypedNodes = Pick<DesignDocumentV2, 'nodes'>;
import {
  checkConformance,
  EMPTY_ATTRIBUTE_SCHEMA,
  findFunction,
  typeAppearance,
  type ActiveToolkit,
  type ExtensionDiagnostic,
  type ProjectAttributeSchema,
} from '@app/extensions';

/**
 * What views and the inspector need to know about the active project, derived purely from the
 * project registry (app/extensions) and the current document. No React or Three.js here.
 */
export interface ProjectViewContext {
  /** null: no active project (none selected, or activation failed). */
  readonly project: ActiveToolkit | null;
  /** Conformance of the current document to the project's node types (empty without a project). */
  readonly conformance: readonly ExtensionDiagnostic[];
  /** Exterior façade per node type (see `projectFacadeProvider`). */
  readonly facade: FacadeProvider;
  /**
   * The project's attribute schema IN USE (docs/PROJECT-ATTRIBUTES.md): the same custom node
   * fields for every node and edge fields for every edge. Views read custom values only through
   * the shared resolver with this schema. Empty without a project.
   */
  readonly attributes: ProjectAttributeSchema;
}

/**
 * Façade used for nodes whose type definition is broken: a closed wall. Deliberately different
 * from any working type so that the broken definition is visible in the Architecture view (which
 * also lists the broken types); never a silent fallback to another type's façade.
 */
export const BROKEN_TYPE_FACADE: FacadeSpec = Object.freeze({ windowFraction: 0 });

/**
 * Façade provider for the active project: the type's own declaration, else the existing example
 * façade (identical to today's behaviour without a project); broken definitions get
 * `BROKEN_TYPE_FACADE`. Colours are unchanged (`typeColor`).
 */
export function projectFacadeProvider(project: ActiveToolkit | null): FacadeProvider {
  const cache = new Map<string, FacadeSpec>();
  return (functionId) => {
    let spec = cache.get(functionId);
    if (!spec) {
      const appearance = typeAppearance(project, functionId);
      spec = appearance.status === 'ok' ? appearance.facade : BROKEN_TYPE_FACADE;
      cache.set(functionId, spec);
    }
    return spec;
  };
}

/** Context for `doc`. Pass the project's `facade` provider to keep it stable across document edits. */
export function buildProjectViewContext(
  project: ActiveToolkit | null,
  doc: TypedNodes & { readonly edges?: readonly { readonly id: number; readonly custom: { readonly [key: string]: string | number | boolean | null } }[] },
  facade: FacadeProvider = projectFacadeProvider(project),
  attributes: ProjectAttributeSchema = project?.attributeBaseline.schema ?? EMPTY_ATTRIBUTE_SCHEMA,
): ProjectViewContext {
  return { project, conformance: checkConformance(doc, project, attributes), facade, attributes };
}

/**
 * How the active project knows a `function`:
 * - `no-project`: there is no active project (today's behaviour);
 * - `undefined-type`: the project does not define it (fallback colour and façade);
 * - `registered`: a valid definition;
 * - `broken`: the definition is invalid or duplicated (disabled; `problems` explain why).
 */
export type FunctionStatus =
  | { readonly kind: 'no-project' }
  | { readonly kind: 'undefined-type' }
  | { readonly kind: 'registered'; readonly label: string; readonly file: string }
  | { readonly kind: 'broken'; readonly label: string | null; readonly file: string; readonly problems: readonly string[] };

export function functionStatus(project: ActiveToolkit | null, functionId: string): FunctionStatus {
  if (!project) return { kind: 'no-project' };
  const type = findFunction(project, functionId);
  if (!type) return { kind: 'undefined-type' };
  if (type.status.ok) return { kind: 'registered', label: type.definition.label, file: type.file };
  const ids = new Set(type.status.diagnosticIds);
  // A broken definition's label is unvalidated student data: use it only if it is text.
  const label = (type.definition as { label?: unknown }).label;
  return {
    kind: 'broken',
    label: typeof label === 'string' && label !== '' ? label : null,
    file: type.file,
    problems: project.diagnostics.filter((d) => ids.has(d.id)).map((d) => d.message),
  };
}

/**
 * Readable name of a function for labels and cards: its current label ("Gallery"), so a rename shows at
 * once; the id is added only for an invalid definition, or is the name of an unknown function.
 */
export function typeDisplayName(status: FunctionStatus, functionId: string): string {
  if (status.kind === 'registered') return status.label;
  if (status.kind === 'broken') return `${status.label ?? functionId} (${functionId}) — invalid definition`;
  return functionId;
}

/** Ids of the document's node types whose definition is broken (sorted). */
export function brokenTypeIds(project: ActiveToolkit | null, doc: TypedNodes): string[] {
  if (!project) return [];
  return [...new Set((doc.nodes as readonly { readonly function: string }[]).map((n) => n.function))].filter((t) => functionStatus(project, t).kind === 'broken').sort();
}
