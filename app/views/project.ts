import type { FacadeProvider, FacadeSpec } from '@app/building';
import type { DesignDocument } from '@app/document';
import type { DesignDocumentV2 } from '@app/document/v2';

/** Only node ids and types are read: a v1 document, or the stored schema-v2 document. */
type TypedNodes = Pick<DesignDocument, 'nodes'> | Pick<DesignDocumentV2, 'nodes'>;
import {
  checkConformance,
  findNodeType,
  typeAppearance,
  type ActiveProject,
  type ExtensionDiagnostic,
} from '@app/extensions';

/**
 * What views and the inspector need to know about the active project, derived purely from the
 * project registry (app/extensions) and the current document. No React or Three.js here.
 */
export interface ProjectViewContext {
  /** null: no active project (none selected, or activation failed). */
  readonly project: ActiveProject | null;
  /** Conformance of the current document to the project's node types (empty without a project). */
  readonly conformance: readonly ExtensionDiagnostic[];
  /** Exterior façade per node type (see `projectFacadeProvider`). */
  readonly facade: FacadeProvider;
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
export function projectFacadeProvider(project: ActiveProject | null): FacadeProvider {
  const cache = new Map<string, FacadeSpec>();
  return (typeId) => {
    let spec = cache.get(typeId);
    if (!spec) {
      const appearance = typeAppearance(project, typeId);
      spec = appearance.status === 'ok' ? appearance.facade : BROKEN_TYPE_FACADE;
      cache.set(typeId, spec);
    }
    return spec;
  };
}

/** Context for `doc`. Pass the project's `facade` provider to keep it stable across document edits. */
export function buildProjectViewContext(
  project: ActiveProject | null,
  doc: TypedNodes,
  facade: FacadeProvider = projectFacadeProvider(project),
): ProjectViewContext {
  return { project, conformance: checkConformance(doc, project), facade };
}

/**
 * How the active project knows a `typeId`:
 * - `no-project`: there is no active project (today's behaviour);
 * - `undefined-type`: the project does not define it (fallback colour and façade);
 * - `registered`: a valid definition;
 * - `broken`: the definition is invalid or duplicated (disabled; `problems` explain why).
 */
export type NodeTypeStatus =
  | { readonly kind: 'no-project' }
  | { readonly kind: 'undefined-type' }
  | { readonly kind: 'registered'; readonly label: string; readonly file: string }
  | { readonly kind: 'broken'; readonly label: string | null; readonly file: string; readonly problems: readonly string[] };

export function nodeTypeStatus(project: ActiveProject | null, typeId: string): NodeTypeStatus {
  if (!project) return { kind: 'no-project' };
  const type = findNodeType(project, typeId);
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

/** Readable name of a type for menus and labels: "Gallery (gallery)", or the id alone. */
export function typeDisplayName(status: NodeTypeStatus, typeId: string): string {
  if (status.kind === 'registered') return `${status.label} (${typeId})`;
  if (status.kind === 'broken') return `${status.label ?? typeId} (${typeId}) — invalid definition`;
  return typeId;
}

/** Ids of the document's node types whose definition is broken (sorted). */
export function brokenTypeIds(project: ActiveProject | null, doc: TypedNodes): string[] {
  if (!project) return [];
  return [...new Set((doc.nodes as readonly { readonly typeId: string }[]).map((n) => n.typeId))].filter((t) => nodeTypeStatus(project, t).kind === 'broken').sort();
}
