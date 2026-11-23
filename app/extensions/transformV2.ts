import {
  type AttributeValue,
  DEFAULT_LIMITS,
  type DesignDocumentV2,
  footprintCells,
  formatIssuePath,
  type GridCoord,
  gridKey,
  layoutAddedDiagramNodes,
  positionSchema,
  RELATIONSHIP_KINDS,
  type RelationshipEdge,
  type RelationshipKind,
  type RoomNode,
  type RoomSize,
  settleDiagramPositions,
  sizeSchema,
  unorderedPairKey,
  validateDocumentV2,
} from '@app/document';
import { resolveRelationships } from '@app/spatial';
import type { ItemRef, SpatialOperation } from '@student-api';
import type { ActiveToolkit, RegisteredFunction } from './activate';
import { checkConformance, findFunction, findRegressions } from './conformance';
import { diagnostic, fail, ok, type ExtensionDiagnostic, type ExtensionIssueCode, type ExtensionResult } from './diagnostics';
import { describeField, checkFieldValue, fieldForKey, EMPTY_ATTRIBUTE_SCHEMA, type AttributeCollection, type AttributeField, type ProjectAttributeSchema } from './projectAttributes';
import { writeFieldValue } from './resolveAttributes';

/**
 * Atomic application of Student API operations to a document: per-operation checks on a private
 * draft → `validateDocumentV2` on the final draft → conformance non-regression; nothing but
 * diagnostics on failure. Rules:
 *
 * - `add-node`: optional `size` (default [1, 1, 1]); the room's footprint must not overlap
 *   another room (`occupied-cell`). New nodes and edges get the document's next ids
 *   (`nextNodeId` / `nextEdgeId`, in operation order; never reused); an operation's optional `ref`
 *   names the new item for later operations (`ItemRef`).
 * - `add-edge`: `access` | `open`.
 *   The rooms need NOT touch: a non-adjacent relationship is valid; its spatial status is derived.
 * - `set-node-geometry`: moves and/or resizes an existing (or earlier-added) room, anchored at the
 *   minimum corner. Refused if the new box overlaps another room, exceeds the size or coordinate
 *   limits, or takes cells of a connector generated for the document the run started from (a
 *   transformation cannot ask for confirmation).
 * - New rooms that take cells of generated connectors are NOT refused here, but are never silent:
 *   `displacedRoutes` lists the affected relationships, and the host must ask for confirmation
 *   ("Move anyway and recalculate") before applying `after`.
 * - Diagram (2026-11-23): when nodes are added, `after` stores a diagram position for every node —
 *   the existing nodes where they were shown, the new ones laid out from their relationships
 *   (`layoutAddedDiagramNodes`) below them — so later drags never re-flow the diagram.
 */

export interface TransformationPreviewV2 {
  readonly before: DesignDocumentV2;
  readonly after: DesignDocumentV2;
  readonly operations: readonly SpatialOperation[];
  readonly resolvedDiagnosticIds: readonly string[];
  /** Relationship ids whose generated connector cells the new rooms would take (sorted). */
  readonly displacedRoutes: readonly number[];
  /** The ids the app gave to the operations' local `ref` names (new nodes and edges). */
  readonly assigned: { readonly nodes: Readonly<Record<string, number>>; readonly edges: Readonly<Record<string, number>> };
  readonly summary?: string;
}

interface DraftV2 {
  /** The project attribute schema in use: the fields every node / edge may be given values for. */
  readonly schema: ProjectAttributeSchema;
  readonly nodes: RoomNode[];
  readonly edges: DesignDocumentV2['edges'];
  readonly byId: Map<number, RoomNode>;
  readonly edgeById: Map<number, DesignDocumentV2['edges'][number]>;
  readonly cells: Map<string, number>;
  readonly pairs: Set<string>;
  readonly added: RoomNode[];
  /** The ids the next new node / edge get (the document's counters, advanced in operation order). */
  nextNodeId: number;
  nextEdgeId: number;
  /** Local `ref` names of the nodes / edges added so far in this run → their assigned ids. */
  readonly nodeRefs: Map<string, number>;
  readonly edgeRefs: Map<string, number>;
  /** The document the run started from (its generated connector cells are read lazily). */
  readonly source: DesignDocumentV2;
  routeCells?: ReturnType<typeof resolveRelationships>['occupancy'];
}

/** The id an operation's `ItemRef` stands for: an existing id, or the `ref` of an earlier addition. */
function resolveRef(ref: ItemRef, ids: ReadonlyMap<number, unknown>, refs: ReadonlyMap<string, number>): number | undefined {
  if (typeof ref === 'number') return ids.has(ref) ? ref : undefined;
  return refs.get(ref);
}

const describeRef = (ref: ItemRef) => (typeof ref === 'number' ? String(ref) : `"${ref}"`);

/** A new `ref` must be text and not used yet in this run. */
function refProblem(ref: string | undefined, refs: ReadonlyMap<string, number>, i: number, what: string): Check {
  if (ref === undefined) return null;
  if (ref.trim() === '') return opError(i, 'invalid-id', `${what}: ref must be a non-empty text`);
  if (refs.has(ref)) return opError(i, 'invalid-id', `${what}: ref "${ref}" is already used by an earlier operation`);
  return null;
}

type Check = ExtensionDiagnostic | null;

const fmt = (g: readonly number[]) => `[${g.join(', ')}]`;

/** Relationship kind for an operation's kind, or undefined if unknown. */
export function relationshipKindOf(kind: string): RelationshipKind | undefined {
  return (RELATIONSHIP_KINDS as readonly string[]).includes(kind) ? (kind as RelationshipKind) : undefined;
}

export function opError(index: number, code: ExtensionIssueCode, message: string, attribute?: string): ExtensionDiagnostic {
  return diagnostic(code, 'error', { kind: 'operation', index }, `operation ${index + 1}: ${message}`, attribute === undefined ? {} : { attribute });
}

/** The node's type, if it is registered and valid; otherwise a diagnostic explaining why not. */
export function writableType(project: ActiveToolkit, functionId: string, index: number, what: string): RegisteredFunction | ExtensionDiagnostic {
  const type = findFunction(project, functionId);
  if (!type) return opError(index, 'type-not-registered', `${what}: type "${functionId}" is not a node type of project "${project.id}"`);
  if (!type.status.ok) return opError(index, 'broken-node-type', `${what}: type "${functionId}" (${type.file}) is invalid and cannot be used`);
  return type;
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
  const what = op.ref === undefined ? 'add-node' : `add-node "${op.ref}"`;
  const badRef = refProblem(op.ref, draft.nodeRefs, i, what);
  if (badRef) return badRef;
  const pos = positionSchema.safeParse(op.position);
  if (!pos.success) return opError(i, 'invalid-position', `${what}: ${pos.error.issues[0]?.message ?? 'invalid position'}`);
  const size = sizeSchema.safeParse(op.size ?? [1, 1, 1]);
  if (!size.success) return opError(i, 'invalid-size', `${what}: ${size.error.issues[0]?.message ?? 'invalid size'}`);
  const room = {
    position: [pos.data[0], pos.data[1], pos.data[2]] as GridCoord,
    size: [size.data[0], size.data[1], size.data[2]] as RoomSize,
  };
  const limit = DEFAULT_LIMITS.maxAbsCoordinate;
  const cells = footprintCells(room);
  const far = cells.find((c) => c.some((v) => Math.abs(v) > limit));
  if (far) return opError(i, 'invalid-position', `${what}: cell ${fmt(far)} exceeds the coordinate limit of ±${limit}`);
  for (const cell of cells) {
    const occupant = draft.cells.get(gridKey(cell));
    if (occupant !== undefined) return opError(i, 'occupied-cell', `${what}: cell ${fmt(cell)} is already occupied by node ${occupant}`);
  }
  const type = writableType(project, op.function, i, what);
  if ('code' in type) return type;
  let custom: Record<string, AttributeValue> = {};
  for (const [key, value] of Object.entries(op.custom ?? {})) {
    const field = fieldWrite(draft.schema, 'nodes', key, value, i, what, project.id);
    if ('code' in field) return field;
    custom = writeFieldValue(field, custom, value);
  }
  const node: RoomNode = { id: draft.nextNodeId++, function: op.function, ...room, custom };
  if (op.ref !== undefined) draft.nodeRefs.set(op.ref, node.id);
  draft.nodes.push(node);
  draft.byId.set(node.id, node);
  draft.added.push(node);
  for (const cell of cells) draft.cells.set(gridKey(cell), node.id);
  return null;
}

function addEdge(draft: DraftV2, op: Extract<SpatialOperation, { op: 'add-edge' }>, i: number): Check {
  const what = op.ref === undefined ? 'add-edge' : `add-edge "${op.ref}"`;
  const badRef = refProblem(op.ref, draft.edgeRefs, i, what);
  if (badRef) return badRef;
  const kind = relationshipKindOf(op.relationship);
  if (kind === undefined) {
    return opError(
      i,
      'unknown-edge-kind',
      `${what}: relationship "${op.relationship}" is not one of ${RELATIONSHIP_KINDS.join(', ')}`,
    );
  }
  const source = resolveRef(op.source, draft.byId, draft.nodeRefs);
  const target = resolveRef(op.target, draft.byId, draft.nodeRefs);
  if (source === undefined) return opError(i, 'missing-node', `${what}: node ${describeRef(op.source)} does not exist (yet)`);
  if (target === undefined) return opError(i, 'missing-node', `${what}: node ${describeRef(op.target)} does not exist (yet)`);
  if (source === target) return opError(i, 'self-edge', `${what}: an edge cannot connect node ${source} to itself`);
  if (draft.pairs.has(unorderedPairKey(source, target))) {
    return opError(i, 'duplicate-relationship', `${what}: nodes ${source} and ${target} are already connected`);
  }
  const c = op.corridor;
  const corridor = c && (c.walls !== undefined || c.roof !== undefined || c.width !== undefined)
    ? {
        ...(c.walls !== undefined && { walls: c.walls }),
        ...(c.roof !== undefined && { roof: c.roof }),
        ...(c.width !== undefined && { width: c.width }),
      }
    : undefined;
  const edge: RelationshipEdge = { id: draft.nextEdgeId++, source, target, relationship: kind, ...(corridor && { corridor }), custom: {} };
  if (op.ref !== undefined) draft.edgeRefs.set(op.ref, edge.id);
  draft.edges.push(edge);
  draft.edgeById.set(edge.id, edge);
  draft.pairs.add(unorderedPairKey(source, target));
  return null;
}

function setNodeCustomAttribute(draft: DraftV2, project: ActiveToolkit, op: Extract<SpatialOperation, { op: 'set-node-custom-attribute' }>, i: number): Check {
  const what = `set-node-custom-attribute ${describeRef(op.nodeId)}.${op.key}`;
  const id = resolveRef(op.nodeId, draft.byId, draft.nodeRefs);
  const node = id === undefined ? undefined : draft.byId.get(id);
  if (!node) return opError(i, 'missing-node', `${what}: node ${describeRef(op.nodeId)} does not exist`);
  const field = fieldWrite(draft.schema, 'nodes', op.key, op.value, i, what, project.id);
  if ('code' in field) return field;
  node.custom = writeFieldValue(field, node.custom, op.value);
  return null;
}

function setEdgeCustomAttribute(draft: DraftV2, project: ActiveToolkit, op: Extract<SpatialOperation, { op: 'set-edge-custom-attribute' }>, i: number): Check {
  const what = `set-edge-custom-attribute ${describeRef(op.edgeId)}.${op.key}`;
  const id = resolveRef(op.edgeId, draft.edgeById, draft.edgeRefs);
  const edge = id === undefined ? undefined : draft.edgeById.get(id);
  if (!edge) return opError(i, 'missing-edge', `${what}: edge ${describeRef(op.edgeId)} does not exist`);
  const field = fieldWrite(draft.schema, 'edges', op.key, op.value, i, what, project.id);
  if ('code' in field) return field;
  edge.custom = writeFieldValue(field, edge.custom, op.value);
  return null;
}

function setNodeGeometry(draft: DraftV2, op: Extract<SpatialOperation, { op: 'set-node-geometry' }>, i: number): Check {
  const what = `set-node-geometry ${describeRef(op.nodeId)}`;
  const id = resolveRef(op.nodeId, draft.byId, draft.nodeRefs);
  const node = id === undefined ? undefined : draft.byId.get(id);
  if (!node) return opError(i, 'missing-node', `${what}: node ${describeRef(op.nodeId)} does not exist`);
  if (op.position === undefined && op.size === undefined) return opError(i, 'invalid-position', `${what}: give a new position, a new size, or both`);
  const pos = positionSchema.safeParse(op.position ?? node.position);
  if (!pos.success) return opError(i, 'invalid-position', `${what}: ${pos.error.issues[0]?.message ?? 'invalid position'}`);
  const size = sizeSchema.safeParse(op.size ?? node.size);
  if (!size.success) return opError(i, 'invalid-size', `${what}: ${size.error.issues[0]?.message ?? 'invalid size'}`);
  const box = {
    position: [pos.data[0], pos.data[1], pos.data[2]] as GridCoord,
    size: [size.data[0], size.data[1], size.data[2]] as RoomSize,
  };
  const limit = DEFAULT_LIMITS.maxAbsCoordinate;
  const cells = footprintCells(box);
  const far = cells.find((c) => c.some((v) => Math.abs(v) > limit));
  if (far) return opError(i, 'invalid-position', `${what}: cell ${fmt(far)} exceeds the coordinate limit of ±${limit}`);
  draft.routeCells ??= resolveRelationships(draft.source).occupancy;
  for (const cell of cells) {
    const occupant = draft.cells.get(gridKey(cell));
    if (occupant !== undefined && occupant !== node.id) {
      return opError(i, 'occupied-cell', `${what}: cell ${fmt(cell)} is already occupied by node ${occupant}`);
    }
    const route = draft.routeCells.at(cell);
    if (route?.kind === 'route') {
      return opError(i, 'occupied-cell', `${what}: cell ${fmt(cell)} is a generated connector of relationship ${route.edgeId}`);
    }
  }
  for (const cell of footprintCells(node)) draft.cells.delete(gridKey(cell));
  node.position = box.position;
  node.size = box.size;
  for (const cell of cells) draft.cells.set(gridKey(cell), node.id);
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
    pairs: new Set(copy.edges.map((e) => unorderedPairKey(e.source, e.target))),
    added: [],
    nextNodeId: copy.nextNodeId,
    nextEdgeId: copy.nextEdgeId,
    nodeRefs: new Map(),
    edgeRefs: new Map(),
    source: doc,
  };

  for (const [i, op] of operations.entries()) {
    const problem =
      op.op === 'add-node'
        ? addNode(draft, project, op, i)
        : op.op === 'add-edge'
          ? addEdge(draft, op, i)
          : op.op === 'set-node-custom-attribute'
            ? setNodeCustomAttribute(draft, project, op, i)
            : op.op === 'set-edge-custom-attribute'
              ? setEdgeCustomAttribute(draft, project, op, i)
              : setNodeGeometry(draft, op, i);
    if (problem) return fail([problem]);
  }

  // New nodes get diagram positions laid out from their relationships (never from cells), and the
  // existing nodes keep the positions they are shown at, so the diagram does not re-flow later.
  const diagram =
    draft.added.length === 0
      ? copy.diagram
      : (() => {
          const shown = settleDiagramPositions(doc);
          return { positions: { ...shown, ...layoutAddedDiagramNodes(copy.edges, draft.added.map((n) => n.id), shown) } };
        })();
  const validated = validateDocumentV2({ ...copy, diagram, nextNodeId: draft.nextNodeId, nextEdgeId: draft.nextEdgeId });
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

  const displaced = new Set<number>();
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
    displacedRoutes: [...displaced].sort((a, b) => a - b),
    assigned: { nodes: Object.fromEntries(draft.nodeRefs), edges: Object.fromEntries(draft.edgeRefs) },
    ...(summary !== undefined && { summary }),
  });
}
