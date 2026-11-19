import { exampleFacadeProvider, type FacadeSpec } from '@app/building';
import type { AttributeValue, DesignDocumentV2 } from '@app/document';
import { typeColor } from '@core/viewer/appearance';
import type { ActiveToolkit, RegisteredNodeType } from './activate';
import { diagnostic, isBlocking, type ExtensionDiagnostic } from './diagnostics';
import { describeField, type ProjectAttributeSchema } from './projectAttributes';
import { attributesOutsideSchema, resolveEdgeAttributes, resolveNodeAttributes, type EffectiveAttribute } from './resolveAttributes';

/**
 * Since the project-wide attribute schema (docs/PROJECT-ATTRIBUTES.md), custom values are checked
 * against the project's fields — the same for every node (or edge) whatever its type — through
 * the shared resolver. The table below lists the node cases; edges have the attribute rows.
 *
 * | stored value not valid for its field          | warning | invalid-attribute-value|<kind>:<id>|<key> |
 * | value stored under a field's former key       | info    | legacy-attribute-key|<kind>:<id>|<old>  |
 * | stored attribute that is not a project field  | info    | undeclared-attribute|<kind>:<id>|<key>   |
 *
 * Original Stage 3 description (type rows still apply):
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
export const findNodeType = (project: ActiveToolkit, typeId: string): RegisteredNodeType | undefined =>
  project.nodeTypes.find((t) => t.id === typeId);

type CheckedDocument = Pick<DesignDocumentV2, 'nodes'> & {
  readonly edges?: readonly { readonly id: number; readonly attributes: { readonly [key: string]: AttributeValue } }[];
};

/** Attribute diagnostics of one node or edge against the project's fields (one shared resolver). */
function attributeChecks(
  resolved: readonly EffectiveAttribute[],
  outside: { readonly [key: string]: AttributeValue },
  subject: { readonly kind: 'node' | 'edge'; readonly id: number },
  projectId: string,
): ExtensionDiagnostic[] {
  const out: ExtensionDiagnostic[] = [];
  const name = `${subject.kind} "${subject.id}"`;
  for (const r of resolved) {
    const { field } = r;
    if (r.stored === 'invalid') {
      const fallback = r.value !== undefined && r.value !== null ? `; ${r.source === 'type-default' ? 'the type default' : 'the default'} ${JSON.stringify(r.value)} is used` : '';
      out.push(
        diagnostic(
          'invalid-attribute-value',
          'warning',
          subject,
          `${name}: attribute "${field.key}" is ${JSON.stringify(r.storedValue)} but must be ${describeField(field)}${fallback} (the stored value is kept)`,
          { attribute: field.key },
        ),
      );
    }
    for (const hidden of r.shadowedKeys ?? []) {
      out.push(
        diagnostic(
          'legacy-attribute-key',
          'info',
          subject,
          `${name} also stores a different value under "${hidden}", a former name of "${field.key}"; the value under "${r.storedKey}" is used and the other is kept unchanged`,
          { attribute: hidden },
        ),
      );
    }
    if (r.storedKey !== undefined && r.storedKey !== field.key) {
      out.push(
        diagnostic(
          'legacy-attribute-key',
          'info',
          subject,
          `${name} stores "${field.key}" under its former name "${r.storedKey}"; it is read as "${field.key}" and saved under the new name when edited`,
          { attribute: r.storedKey },
        ),
      );
    }
  }
  for (const key of Object.keys(outside)) {
    out.push(
      diagnostic(
        'undeclared-attribute',
        'info',
        subject,
        `${name} has attribute "${key}", which is not a ${subject.kind} field of project "${projectId}" (kept unchanged)`,
        { attribute: key },
      ),
    );
  }
  return out;
}

/**
 * Works on schema-v1 and schema-v2 documents. Node types are checked against the project's
 * types; custom values of nodes AND edges against the project's attribute schema in use
 * (`schema`; default: the toolkit files' baseline). Never changes the document.
 */
export function checkConformance(doc: CheckedDocument, project: ActiveToolkit | null, schema?: ProjectAttributeSchema): ExtensionDiagnostic[] {
  if (!project) return [];
  const fields = schema ?? project.attributeBaseline.schema;
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
    } else if (!type.status.ok) {
      out.push(
        diagnostic('broken-node-type', 'error', subject, `node "${node.id}" uses type "${node.typeId}", whose definition (${type.file}) is invalid`),
      );
    }
    out.push(...attributeChecks(resolveNodeAttributes(fields, node), attributesOutsideSchema(fields, 'nodes', node.attributes), subject, project.id));
  }
  for (const edge of doc.edges ?? []) {
    const subject = { kind: 'edge', id: edge.id } as const;
    out.push(...attributeChecks(resolveEdgeAttributes(fields, edge), attributesOutsideSchema(fields, 'edges', edge.attributes), subject, project.id));
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
export function typeAppearance(project: ActiveToolkit | null, typeId: string): TypeAppearance {
  const color = typeColor(typeId);
  const type = project ? findNodeType(project, typeId) : undefined;
  if (type && !type.status.ok) return { status: 'broken', color, diagnosticIds: type.status.diagnosticIds };
  const declared = type?.definition.facade;
  return { status: 'ok', color, facade: declared ? { windowFraction: declared.windowFraction } : exampleFacadeProvider(typeId) };
}
