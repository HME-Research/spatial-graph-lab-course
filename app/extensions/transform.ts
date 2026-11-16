import {
  DEFAULT_LIMITS,
  EDGE_KINDS,
  edgeGeometryRequirement,
  formatIssuePath,
  gridKey,
  gridSchema,
  idSchema,
  isEdgeGeometryValid,
  unorderedPairKey,
  validateDocument,
  type AttributeValue,
  type DesignDocument,
  type EdgeKind,
  type GraphNode,
  type GridCoord,
} from '@app/document';
import type { SpatialOperation } from '@student-api';
import type { ActiveProject, RegisteredNodeType } from './activate';
import { checkValue, describeSpec, specFor } from './attributes';
import { checkConformance, findNodeType, findRegressions } from './conformance';
import { diagnostic, fail, ok, type ExtensionDiagnostic, type ExtensionIssueCode, type ExtensionResult } from './diagnostics';

/**
 * Atomic application of spatial operations.
 *
 * 1. Each operation is checked for permission and semantics against the evolving private draft
 *    (existing schema-v1 rules for ids, grid cells and edge geometry; project rules for node
 *    types and attributes). The first failure aborts with an `operation:<index>` diagnostic.
 * 2. The final draft must pass the full schema-v1 `validateDocument`. Only the final state must
 *    be valid, so for example `add-node` followed by `add-edge` to that node works.
 * 3. Conformance non-regression: no blocking diagnostic identity may appear that was not
 *    already present before.
 * On any failure nothing is returned but diagnostics: the caller's document is untouched.
 *
 * Attribute writes (`add-node` attributes, `set-node-attribute`):
 * - allowed only for attributes declared by the node's valid, registered type;
 * - the value must be valid for the declaration, or null ("no value");
 * - a missing declared attribute may be written; an invalid stored value may be replaced by a
 *   valid one (resolving its diagnostic); undeclared/legacy attributes are never written or
 *   removed and stay exactly as stored; defaults are never written implicitly.
 */

export interface TransformationPreview {
  /** The document the transformation was computed from (stale check before applying). */
  readonly before: DesignDocument;
  /** The fully validated result. */
  readonly after: DesignDocument;
  readonly operations: readonly SpatialOperation[];
  /** Conformance diagnostic ids present before and gone after. */
  readonly resolvedDiagnosticIds: readonly string[];
  readonly summary?: string;
}

interface Draft {
  readonly doc: DesignDocument;
  readonly nodes: Map<string, GraphNode>;
  readonly cells: Map<string, string>;
  readonly edgeIds: Set<string>;
  readonly pairs: Set<string>;
}

type Check = ExtensionDiagnostic | null;

const fmt = (g: readonly number[]) => `[${g.join(', ')}]`;

export function opError(index: number, code: ExtensionIssueCode, message: string, attribute?: string): ExtensionDiagnostic {
  return diagnostic(code, 'error', { kind: 'operation', index }, `operation ${index + 1}: ${message}`, attribute === undefined ? {} : { attribute });
}

/** The node's type, if it is registered and valid; otherwise a diagnostic explaining why not. */
export function writableType(project: ActiveProject, typeId: string, index: number, what: string): RegisteredNodeType | ExtensionDiagnostic {
  const type = findNodeType(project, typeId);
  if (!type) return opError(index, 'type-not-registered', `${what}: type "${typeId}" is not a node type of project "${project.id}"`);
  if (!type.status.ok) return opError(index, 'broken-node-type', `${what}: type "${typeId}" (${type.file}) is invalid and cannot be used`);
  return type;
}

export function checkAttributeWrite(type: RegisteredNodeType, key: string, value: AttributeValue, index: number, what: string): Check {
  const spec = specFor(type.definition.attributes ?? {}, key);
  if (!spec) return opError(index, 'undeclared-attribute-write', `${what}: type "${type.id}" does not declare attribute "${key}"`, key);
  if (checkValue(spec, value) === 'invalid') {
    return opError(index, 'invalid-attribute-value', `${what}: attribute "${key}" must be ${describeSpec(spec)} or null, not ${JSON.stringify(value)}`, key);
  }
  return null;
}

function addNode(draft: Draft, project: ActiveProject, op: Extract<SpatialOperation, { op: 'add-node' }>, i: number): Check {
  const what = `add-node "${op.id}"`;
  const id = idSchema.safeParse(op.id);
  if (!id.success) return opError(i, 'invalid-id', `${what}: ${id.error.issues[0]?.message ?? 'invalid id'}`);
  if (draft.nodes.has(op.id)) return opError(i, 'duplicate-node-id', `${what}: a node with id "${op.id}" already exists`);
  const grid = gridSchema.safeParse(op.grid);
  if (!grid.success) return opError(i, 'invalid-grid', `${what}: ${grid.error.issues[0]?.message ?? 'invalid grid'}`);
  if (op.size !== undefined && !(op.size[0] === 1 && op.size[1] === 1 && op.size[2] === 1)) {
    return opError(i, 'invalid-size', `${what}: a schema-v1 design holds single-cell rooms only (size [1, 1, 1]), not ${fmt(op.size)}`);
  }
  const cell: GridCoord = [grid.data[0], grid.data[1], grid.data[2]];
  const limit = DEFAULT_LIMITS.maxAbsCoordinate;
  if (cell.some((c) => Math.abs(c) > limit)) return opError(i, 'invalid-grid', `${what}: cell ${fmt(cell)} exceeds the coordinate limit of ±${limit}`);
  const occupant = draft.cells.get(gridKey(cell));
  if (occupant !== undefined) return opError(i, 'occupied-cell', `${what}: cell ${fmt(cell)} is already occupied by node "${occupant}"`);
  const type = writableType(project, op.typeId, i, what);
  if ('code' in type) return type;
  const attributes: Record<string, AttributeValue> = {};
  for (const [key, value] of Object.entries(op.attributes ?? {})) {
    const problem = checkAttributeWrite(type, key, value, i, what);
    if (problem) return problem;
    attributes[key] = value;
  }
  const node: GraphNode = { id: op.id, grid: cell, typeId: op.typeId, attributes };
  draft.doc.nodes.push(node);
  draft.nodes.set(node.id, node);
  draft.cells.set(gridKey(cell), node.id);
  return null;
}

function addEdge(draft: Draft, op: Extract<SpatialOperation, { op: 'add-edge' }>, i: number): Check {
  const what = `add-edge "${op.id}"`;
  const id = idSchema.safeParse(op.id);
  if (!id.success) return opError(i, 'invalid-id', `${what}: ${id.error.issues[0]?.message ?? 'invalid id'}`);
  if (draft.edgeIds.has(op.id)) return opError(i, 'duplicate-edge-id', `${what}: an edge with id "${op.id}" already exists`);
  if (op.kind !== 'access' && !(EDGE_KINDS as readonly string[]).includes(op.kind)) {
    return opError(i, 'unknown-edge-kind', `${what}: kind "${op.kind}" is not one of access, ${EDGE_KINDS.join(', ')} (new kinds are not supported)`);
  }
  for (const end of [op.source, op.target]) {
    if (!draft.nodes.has(end)) return opError(i, 'missing-node', `${what}: node "${end}" does not exist`);
  }
  if (op.source === op.target) return opError(i, 'self-edge', `${what}: an edge cannot connect node "${op.source}" to itself`);
  if (draft.pairs.has(unorderedPairKey(op.source, op.target))) {
    return opError(i, 'duplicate-relationship', `${what}: "${op.source}" and "${op.target}" are already connected`);
  }
  const a = draft.nodes.get(op.source)!;
  const b = draft.nodes.get(op.target)!;
  // Schema-v2 `access` in a v1 design: door between wall neighbours, vertical-access between
  // stacked rooms. A v1 design cannot store a relationship between rooms that do not touch.
  // (`open` keeps its v1 meaning here: same-storey wall neighbours.)
  let kind: EdgeKind;
  if (op.kind === 'access') {
    if (isEdgeGeometryValid('door', a.grid, b.grid)) kind = 'door';
    else if (isEdgeGeometryValid('vertical-access', a.grid, b.grid)) kind = 'vertical-access';
    else {
      return opError(
        i,
        'invalid-edge-geometry',
        `${what}: a schema-v1 design can only store "access" between touching rooms; ${fmt(a.grid)} and ${fmt(b.grid)} do not touch`,
      );
    }
  } else kind = op.kind as EdgeKind;
  if (!isEdgeGeometryValid(kind, a.grid, b.grid)) {
    return opError(i, 'invalid-edge-geometry', `${what}: "${kind}" requires ${edgeGeometryRequirement(kind)}; ${fmt(a.grid)} and ${fmt(b.grid)} are not`);
  }
  draft.doc.edges.push({ id: op.id, source: op.source, target: op.target, kind, attributes: {} });
  draft.edgeIds.add(op.id);
  draft.pairs.add(unorderedPairKey(op.source, op.target));
  return null;
}

function setNodeAttribute(draft: Draft, project: ActiveProject, op: Extract<SpatialOperation, { op: 'set-node-attribute' }>, i: number): Check {
  const what = `set-node-attribute "${op.nodeId}.${op.key}"`;
  const node = draft.nodes.get(op.nodeId);
  if (!node) return opError(i, 'missing-node', `${what}: node "${op.nodeId}" does not exist`);
  const type = writableType(project, node.typeId, i, what);
  if ('code' in type) return type;
  const problem = checkAttributeWrite(type, op.key, op.value, i, what);
  if (problem) return problem;
  node.attributes = { ...node.attributes, [op.key]: op.value };
  return null;
}

/** Apply `operations` atomically to `doc` (see module comment). Never mutates `doc`. */
export function applyTransformation(
  doc: DesignDocument,
  project: ActiveProject,
  operations: readonly SpatialOperation[],
  summary?: string,
): ExtensionResult<TransformationPreview> {
  const copy = structuredClone(doc);
  const draft: Draft = {
    doc: copy,
    nodes: new Map(copy.nodes.map((n) => [n.id, n] as const)),
    cells: new Map(copy.nodes.map((n) => [gridKey(n.grid), n.id] as const)),
    edgeIds: new Set(copy.edges.map((e) => e.id)),
    pairs: new Set(copy.edges.map((e) => unorderedPairKey(e.source, e.target))),
  };

  for (const [i, op] of operations.entries()) {
    const problem =
      op.op === 'add-node'
        ? addNode(draft, project, op, i)
        : op.op === 'add-edge'
          ? addEdge(draft, op, i)
          : op.op === 'set-node-attribute'
            ? setNodeAttribute(draft, project, op, i)
            : opError(i, 'undeclared-attribute-write', `set-edge-attribute "${op.edgeId}.${op.key}": edge attributes can only be set on schema-v2 designs`, op.key);
    if (problem) return fail([problem]);
  }

  const validated = validateDocument(draft.doc);
  if (!validated.ok) {
    return fail(
      validated.issues.map((issue, n) =>
        diagnostic(
          'final-document-invalid',
          'error',
          { kind: 'project', id: project.id },
          `the transformed design is invalid: ${formatIssuePath(issue.path)} — ${issue.message} (${issue.code})`,
          { detail: String(n) },
        ),
      ),
    );
  }

  const before = checkConformance(doc, project);
  const after = checkConformance(validated.value, project);
  const regressions = findRegressions(before, after);
  if (regressions.length > 0) {
    return fail(
      regressions.map((r) =>
        diagnostic('conformance-regression', 'error', r.subject, `the transformation would introduce a new problem: ${r.message}`, {
          detail: r.id,
        }),
      ),
    );
  }

  const afterIds = new Set(after.map((d) => d.id));
  return ok({
    before: doc,
    after: validated.value,
    operations,
    resolvedDiagnosticIds: before.filter((d) => !afterIds.has(d.id)).map((d) => d.id),
    ...(summary !== undefined && { summary }),
  });
}
