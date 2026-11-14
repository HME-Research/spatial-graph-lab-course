import { exampleFacadeProvider, type FacadeSpec } from '@app/building';
import type { DesignDocument } from '@app/document';
import { typeColor } from '@core/viewer/appearance';
import type { ActiveProject, RegisteredNodeType } from './activate';
import { checkValue, describeSpec, specFor } from './attributes';
import { diagnostic, isBlocking, type ExtensionDiagnostic } from './diagnostics';

/**
 * Conformance of a valid schema-v1 document to the active project's node types. Never blocks
 * loading a document and never changes it: stored values (including invalid and undeclared ones)
 * are preserved; defaults are resolved on read only.
 *
 * | Case                                   | Severity | Diagnostic id                               |
 * | typeId has no definition (project has types) | warning | unknown-node-type|node:<id>           |
 * | typeId's definition is invalid/duplicated     | error   | broken-node-type|node:<id>            |
 * | declared attribute with an invalid value      | warning | invalid-attribute-value|node:<id>|<key> |
 * | stored attribute not declared by the type     | info    | undeclared-attribute|node:<id>|<key>  |
 * | declared attribute missing or null            | —       | (none: default or undefined is used)  |
 */

/** The registered definition of `typeId` (if several collide, all are broken; the first is returned). */
export const findNodeType = (project: ActiveProject, typeId: string): RegisteredNodeType | undefined =>
  project.nodeTypes.find((t) => t.id === typeId);

export function checkConformance(doc: DesignDocument, project: ActiveProject | null): ExtensionDiagnostic[] {
  if (!project) return [];
  const projectDefinesTypes = project.nodeTypes.length > 0;
  const out: ExtensionDiagnostic[] = [];
  for (const node of doc.nodes) {
    const subject = { kind: 'node', id: node.id } as const;
    const type = findNodeType(project, node.typeId);
    if (!type) {
      if (projectDefinesTypes) {
        out.push(
          diagnostic('unknown-node-type', 'warning', subject, `node "${node.id}" has type "${node.typeId}", which project "${project.id}" does not define`),
        );
      }
      continue;
    }
    if (!type.status.ok) {
      out.push(
        diagnostic('broken-node-type', 'error', subject, `node "${node.id}" uses type "${node.typeId}", whose definition (${type.file}) is invalid; its attributes cannot be checked`),
      );
      continue;
    }
    const specs = type.definition.attributes ?? {};
    for (const [key, value] of Object.entries(node.attributes)) {
      const spec = specFor(specs, key);
      if (!spec) {
        out.push(
          diagnostic('undeclared-attribute', 'info', subject, `node "${node.id}" has attribute "${key}", which type "${type.id}" does not declare (kept unchanged)`, { attribute: key }),
        );
      } else if (checkValue(spec, value) === 'invalid') {
        out.push(
          diagnostic(
            'invalid-attribute-value',
            'warning',
            subject,
            `node "${node.id}": attribute "${key}" is ${JSON.stringify(value)} but must be ${describeSpec(spec)}${spec.default !== undefined ? `; the default ${JSON.stringify(spec.default)} is used` : ''}`,
            { attribute: key },
          ),
        );
      }
    }
  }
  return out;
}

/**
 * Blocking diagnostics present in `after` whose identity was not in `before`. Identity-based:
 * fixing one problem while introducing another is a regression even though the count is equal.
 */
export function findRegressions(before: readonly ExtensionDiagnostic[], after: readonly ExtensionDiagnostic[]): ExtensionDiagnostic[] {
  const known = new Set(before.map((d) => d.id));
  const seen = new Set<string>();
  return after.filter((d) => {
    if (!isBlocking(d) || known.has(d.id) || seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });
}

export type TypeAppearance =
  | { readonly status: 'ok'; readonly color: string; readonly facade: FacadeSpec }
  | { readonly status: 'broken'; readonly color: string; readonly diagnosticIds: readonly string[] };

/**
 * Colour and façade of a node type. Colour is always the existing deterministic `typeColor`
 * (custom colours are deferred). Façade: the type's own declaration, else the existing example
 * façade for that id. A broken definition yields `broken` (no façade), never a silent fallback;
 * no project or no definition gives today's behaviour.
 */
export function typeAppearance(project: ActiveProject | null, typeId: string): TypeAppearance {
  const color = typeColor(typeId);
  const type = project ? findNodeType(project, typeId) : undefined;
  if (type && !type.status.ok) return { status: 'broken', color, diagnosticIds: type.status.diagnosticIds };
  const declared = type?.definition.facade;
  return { status: 'ok', color, facade: declared ? { windowFraction: declared.windowFraction } : exampleFacadeProvider(typeId) };
}
