import {
  DEFAULT_LIMITS,
  formatIssuePath,
  gridKey,
  gridSchema,
  idSchema,
  unorderedPairKey,
  type AttributeValue,
  type GridCoord,
} from '@app/document';
import {
  footprintCells,
  nextDisplayId,
  RELATIONSHIP_KINDS,
  sizeSchema,
  V1_KIND_TO_RELATIONSHIP,
  validateDocumentV2,
  type DesignDocumentV2,
  type RelationshipKind,
  type RoomNode,
  type RoomSize,
} from '@app/document/v2';
import { resolveRelationships } from '@app/spatial';
import type { SpatialOperation } from '@student-api';
import type { ActiveToolkit } from './activate';
import { checkConformance, findRegressions } from './conformance';
import { diagnostic, fail, ok, type ExtensionDiagnostic, type ExtensionResult } from './diagnostics';
import { describeField, checkFieldValue, fieldForKey, EMPTY_ATTRIBUTE_SCHEMA, type AttributeCollection, type AttributeField, type ProjectAttributeSchema } from './projectAttributes';
import { writeFieldValue } from './resolveAttributes';
import { opError, writableType } from './transform';

/**
 * Atomic application of Student API operations to a schema-v2 document. Same pipeline as the
 * v1 `applyTransformation` (per-operation checks on a private draft → `validateDocumentV2` on
 * the final draft → conformance non-regression; nothing but diagnostics on failure), with the
 * schema-v2 rules:
 *
 * - `add-node`: optional `size` (default [1, 1, 1]); the room's footprint must not overlap
 *   another room (`occupied-cell`); a `displayId` is assigned with `nextDisplayId`.
 * - `add-edge`: `access` | `open`, or a legacy v1 kind mapped with `V1_KIND_TO_RELATIONSHIP`.
 *   The rooms need NOT touch: a non-adjacent relationship is valid; its spatial status is derived.
 * - New rooms that take cells of generated connectors are NOT refused here, but are never silent:
 *   `displacedRoutes` lists the affected relationships, and the host must ask for confirmation
 *   ("Move anyway and recalculate") before applying `after`.
 */

export interface TransformationPreviewV2 {
  readonly before: DesignDocumentV2;
  readonly after: DesignDocumentV2;
  readonly operations: readonly SpatialOperation[];
  readonly resolvedDiagnosticIds: readonly string[];
  /** Relationship ids whose generated connector cells the new rooms would take (sorted). */
  readonly displacedRoutes: readonly string[];
  readonly summary?: string;
}

interface DraftV2 {
  /** The project attribute schema in use: the fields every node / edge may be given values for. */
  readonly schema: ProjectAttributeSchema;
  readonly nodes: RoomNode[];
  readonly edges: DesignDocumentV2['edges'];
  readonly byId: Map<string, RoomNode>;
  readonly edgeById: Map<string, DesignDocumentV2['edges'][number]>;
  readonly cells: Map<string, string>;
  readonly edgeIds: Set<string>;
  readonly pairs: Set<string>;
  readonly added: RoomNode[];
}

type Check = ExtensionDiagnostic | null;

const fmt = (g: readonly number[]) => `[${g.join(', ')}]`;

/** Relationship kind for an operation's kind, or undefined if unknown. */
export function relationshipKindOf(kind: string): RelationshipKind | undefined {
  if ((RELATIONSHIP_KINDS as readonly string[]).includes(kind)) return kind as RelationshipKind;
  return Object.prototype.hasOwnProperty.call(V1_KIND_TO_RELATIONSHIP, kind)
    ? V1_KIND_TO_RELATIONSHIP[kind as keyof typeof V1_KIND_TO_RELATIONSHIP]
    : undefined;
}

/**
 * The project field `key` names (current or former key) and a check of `value` against it. Every
 * node — whatever its type — has the same node fields; every edge the same edge fields.
 */
function fieldWrite(
  schema: ProjectAttributeSchema,
  collection: AttributeCollection,
  key: string,
  value: AttributeValue,
  i: number,
  what: string,
  projectId: string,
): AttributeField | ExtensionDiagnostic {
  const field = fieldForKey(schema, collection, key);
  const kind = collection === 'nodes' ? 'node' : 'edge';
  if (!field) return opError(i, 'undeclared-attribute-write', `${what}: "${key}" is not a ${kind} field of project "${projectId}"`, key);
  if (value !== null && checkFieldValue(field, value) !== 'ok') {
    return opError(i, 'invalid-attribute-value', `${what}: attribute "${field.key}" must be ${describeField(field)} or null, not ${JSON.stringify(value)}`, key);
  }
  return field;
}

function addNode(draft: DraftV2, project: ActiveToolkit, op: Extract<SpatialOperation, { op: 'add-node' }>, i: number): Check {
  const what = `add-node "${op.id}"`;
  const id = idSchema.safeParse(op.id);
  if (!id.success) return opError(i, 'invalid-id', `${what}: ${id.error.issues[0]?.message ?? 'invalid id'}`);
  if (draft.byId.has(op.id)) return opError(i, 'duplicate-node-id', `${what}: a node with id "${op.id}" already exists`);
  const grid = gridSchema.safeParse(op.grid);
  if (!grid.success) return opError(i, 'invalid-grid', `${what}: ${grid.error.issues[0]?.message ?? 'invalid grid'}`);
  const size = sizeSchema.safeParse(op.size ?? [1, 1, 1]);
  if (!size.success) return opError(i, 'invalid-size', `${what}: ${size.error.issues[0]?.message ?? 'invalid size'}`);
  const room = {
    grid: [grid.data[0], grid.data[1], grid.data[2]] as GridCoord,
    size: [size.data[0], size.data[1], size.data[2]] as RoomSize,
  };
  const limit = DEFAULT_LIMITS.maxAbsCoordinate;
  const cells = footprintCells(room);
  const far = cells.find((c) => c.some((v) => Math.abs(v) > limit));
  if (far) return opError(i, 'invalid-grid', `${what}: cell ${fmt(far)} exceeds the coordinate limit of ±${limit}`);
  for (const cell of cells) {
    const occupant = draft.cells.get(gridKey(cell));
    if (occupant !== undefined) return opError(i, 'occupied-cell', `${what}: cell ${fmt(cell)} is already occupied by node "${occupant}"`);
  }
  const type = writableType(project, op.typeId, i, what);
  if ('code' in type) return type;
  let attributes: Record<string, AttributeValue> = {};
  for (const [key, value] of Object.entries(op.attributes ?? {})) {
    const field = fieldWrite(draft.schema, 'nodes', key, value, i, what, project.id);
    if ('code' in field) return field;
    attributes = writeFieldValue(field, attributes, value);
  }
  const node: RoomNode = { id: op.id, displayId: nextDisplayId({ nodes: draft.nodes }), ...room, typeId: op.typeId, attributes };
  draft.nodes.push(node);
  draft.byId.set(node.id, node);
  draft.added.push(node);
  for (const cell of cells) draft.cells.set(gridKey(cell), node.id);
  return null;
}

function addEdge(draft: DraftV2, op: Extract<SpatialOperation, { op: 'add-edge' }>, i: number): Check {
  const what = `add-edge "${op.id}"`;
  const id = idSchema.safeParse(op.id);
  if (!id.success) return opError(i, 'invalid-id', `${what}: ${id.error.issues[0]?.message ?? 'invalid id'}`);
  if (draft.edgeIds.has(op.id)) return opError(i, 'duplicate-edge-id', `${what}: an edge with id "${op.id}" already exists`);
  const kind = relationshipKindOf(op.kind);
  if (kind === undefined) {
    return opError(
      i,
      'unknown-edge-kind',
      `${what}: kind "${op.kind}" is not one of ${[...RELATIONSHIP_KINDS, ...Object.keys(V1_KIND_TO_RELATIONSHIP).filter((k) => k !== 'open')].join(', ')} (new kinds are not supported)`,
    );
  }
  for (const end of [op.source, op.target]) {
    if (!draft.byId.has(end)) return opError(i, 'missing-node', `${what}: node "${end}" does not exist`);
  }
  if (op.source === op.target) return opError(i, 'self-edge', `${what}: an edge cannot connect node "${op.source}" to itself`);
  if (draft.pairs.has(unorderedPairKey(op.source, op.target))) {
    return opError(i, 'duplicate-relationship', `${what}: "${op.source}" and "${op.target}" are already connected`);
  }
  const edge = { id: op.id, source: op.source, target: op.target, kind, attributes: {} };
  draft.edges.push(edge);
  draft.edgeById.set(edge.id, edge);
  draft.edgeIds.add(op.id);
  draft.pairs.add(unorderedPairKey(op.source, op.target));
  return null;
}

function setNodeAttribute(draft: DraftV2, project: ActiveToolkit, op: Extract<SpatialOperation, { op: 'set-node-attribute' }>, i: number): Check {
  const what = `set-node-attribute "${op.nodeId}.${op.key}"`;
  const node = draft.byId.get(op.nodeId);
  if (!node) return opError(i, 'missing-node', `${what}: node "${op.nodeId}" does not exist`);
  const field = fieldWrite(draft.schema, 'nodes', op.key, op.value, i, what, project.id);
  if ('code' in field) return field;
  node.attributes = writeFieldValue(field, node.attributes, op.value);
  return null;
}

function setEdgeAttribute(draft: DraftV2, project: ActiveToolkit, op: Extract<SpatialOperation, { op: 'set-edge-attribute' }>, i: number): Check {
  const what = `set-edge-attribute "${op.edgeId}.${op.key}"`;
  const edge = draft.edgeById.get(op.edgeId);
  if (!edge) return opError(i, 'missing-edge', `${what}: edge "${op.edgeId}" does not exist`);
  const field = fieldWrite(draft.schema, 'edges', op.key, op.value, i, what, project.id);
  if ('code' in field) return field;
  edge.attributes = writeFieldValue(field, edge.attributes, op.value);
  return null;
}

/** Apply `operations` atomically to a VALIDATED v2 `doc` (see module comment). Never mutates `doc`. */
export function applyTransformationV2(
  doc: DesignDocumentV2,
  project: ActiveToolkit,
  operations: readonly SpatialOperation[],
  summary?: string,
  schema: ProjectAttributeSchema = project.attributeBaseline?.schema ?? EMPTY_ATTRIBUTE_SCHEMA,
): ExtensionResult<TransformationPreviewV2> {
  const copy = structuredClone(doc);
  const draft: DraftV2 = {
    schema,
    nodes: copy.nodes,
    edges: copy.edges,
    byId: new Map(copy.nodes.map((n) => [n.id, n] as const)),
    edgeById: new Map(copy.edges.map((e) => [e.id, e] as const)),
    cells: new Map(copy.nodes.flatMap((n) => footprintCells(n).map((c) => [gridKey(c), n.id] as const))),
    edgeIds: new Set(copy.edges.map((e) => e.id)),
    pairs: new Set(copy.edges.map((e) => unorderedPairKey(e.source, e.target))),
    added: [],
  };

  for (const [i, op] of operations.entries()) {
    const problem =
      op.op === 'add-node'
        ? addNode(draft, project, op, i)
        : op.op === 'add-edge'
          ? addEdge(draft, op, i)
          : op.op === 'set-node-attribute'
            ? setNodeAttribute(draft, project, op, i)
            : setEdgeAttribute(draft, project, op, i);
    if (problem) return fail([problem]);
  }

  const validated = validateDocumentV2(copy);
  if (!validated.ok) {
    return fail(
      validated.issues.map((issue, n) =>
        diagnostic(
          'final-document-invalid',
          'error',
          { kind: 'toolkit', id: project.id },
          `the transformed design is invalid: ${formatIssuePath(issue.path)} — ${issue.message} (${issue.code})`,
          { detail: String(n) },
        ),
      ),
    );
  }

  const before = checkConformance(doc, project, schema);
  const after = checkConformance(validated.value, project, schema);
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

  const displaced = new Set<string>();
  if (draft.added.length > 0) {
    const occupancy = resolveRelationships(doc).occupancy;
    for (const node of draft.added) {
      for (const cell of footprintCells(node)) {
        const o = occupancy.at(cell);
        if (o?.kind === 'route') displaced.add(o.edgeId);
      }
    }
  }

  const afterIds = new Set(after.map((d) => d.id));
  return ok({
    before: doc,
    after: validated.value,
    operations,
    resolvedDiagnosticIds: before.filter((d) => !afterIds.has(d.id)).map((d) => d.id),
    displacedRoutes: [...displaced].sort(),
    ...(summary !== undefined && { summary }),
  });
}
