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
import type { ActiveProject } from './activate';
import { checkConformance, findRegressions } from './conformance';
import { diagnostic, fail, ok, type ExtensionDiagnostic, type ExtensionResult } from './diagnostics';
import { checkAttributeWrite, opError, writableType } from './transform';

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
  readonly nodes: RoomNode[];
  readonly edges: DesignDocumentV2['edges'];
  readonly byId: Map<string, RoomNode>;
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

function addNode(draft: DraftV2, project: ActiveProject, op: Extract<SpatialOperation, { op: 'add-node' }>, i: number): Check {
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
  const attributes: Record<string, AttributeValue> = {};
  for (const [key, value] of Object.entries(op.attributes ?? {})) {
    const problem = checkAttributeWrite(type, key, value, i, what);
    if (problem) return problem;
    attributes[key] = value;
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
  draft.edges.push({ id: op.id, source: op.source, target: op.target, kind, attributes: {} });
  draft.edgeIds.add(op.id);
  draft.pairs.add(unorderedPairKey(op.source, op.target));
  return null;
}

function setNodeAttribute(draft: DraftV2, project: ActiveProject, op: Extract<SpatialOperation, { op: 'set-node-attribute' }>, i: number): Check {
  const what = `set-node-attribute "${op.nodeId}.${op.key}"`;
  const node = draft.byId.get(op.nodeId);
  if (!node) return opError(i, 'missing-node', `${what}: node "${op.nodeId}" does not exist`);
  const type = writableType(project, node.typeId, i, what);
  if ('code' in type) return type;
  const problem = checkAttributeWrite(type, op.key, op.value, i, what);
  if (problem) return problem;
  node.attributes = { ...node.attributes, [op.key]: op.value };
  return null;
}

/** Apply `operations` atomically to a VALIDATED v2 `doc` (see module comment). Never mutates `doc`. */
export function applyTransformationV2(
  doc: DesignDocumentV2,
  project: ActiveProject,
  operations: readonly SpatialOperation[],
  summary?: string,
): ExtensionResult<TransformationPreviewV2> {
  const copy = structuredClone(doc);
  const draft: DraftV2 = {
    nodes: copy.nodes,
    edges: copy.edges,
    byId: new Map(copy.nodes.map((n) => [n.id, n] as const)),
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
          : setNodeAttribute(draft, project, op, i);
    if (problem) return fail([problem]);
  }

  const validated = validateDocumentV2(copy);
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
