import type { core as zcore } from 'zod';
import { validateGraph, type StructuralIssueCode } from '../graph';
import { edgeGeometryRequirement, gridKey, isEdgeGeometryValid } from './adjacency';
import { DEFAULT_LIMITS, SCHEMA_VERSION, type GraphLimits } from './constants';
import { fail, issue, ok, type GraphIssue, type IssueCode, type Result } from './errors';
import { designGraph } from './graph';
import { designDocumentSchema, type DesignDocument } from './schema';

export interface ValidationOptions {
  /**
   * Optional node-type registry. When supplied, every node's `typeId` must be in it.
   * When omitted (Phase 1 default), only the typeId format is checked.
   */
  readonly knownTypeIds?: Iterable<string>;
  readonly limits?: Partial<GraphLimits>;
}

const fmt = (g: readonly number[]): string => `[${g.join(', ')}]`;

function mapZodIssues(issues: readonly zcore.$ZodIssue[]): GraphIssue[] {
  return issues.map((zi) =>
    issue(
      zi.path.map((p) => (typeof p === 'symbol' ? String(p) : p)),
      'schema',
      zi.message,
    ),
  );
}

/**
 * Validate an unknown value as a DesignDocument: structure (Zod) and graph invariants.
 * Returns a fresh, normalised document on success. Never throws for bad input.
 */
export function validateDocument(input: unknown, options: ValidationOptions = {}): Result<DesignDocument> {
  if (typeof input === 'object' && input !== null && !Array.isArray(input) && 'schemaVersion' in input) {
    const version = (input as { schemaVersion: unknown }).schemaVersion;
    if (version !== SCHEMA_VERSION) {
      return fail([
        issue(
          ['schemaVersion'],
          'unsupported-schema-version',
          `unsupported schemaVersion ${JSON.stringify(version)}; this application reads version ${SCHEMA_VERSION}`,
        ),
      ]);
    }
  }

  const parsed = designDocumentSchema.safeParse(input);
  if (!parsed.success) return fail(mapZodIssues(parsed.error.issues));

  const doc = parsed.data;
  const issues = checkGraphInvariants(doc, options);
  return issues.length > 0 ? fail(issues) : ok(doc);
}

/** Generic structural codes mapped to the v1 document's established codes. */
const STRUCTURAL_TO_DOCUMENT_CODE: Readonly<Record<StructuralIssueCode, IssueCode>> = {
  'duplicate-node-id': 'duplicate-node-id',
  'duplicate-edge-id': 'duplicate-edge-id',
  'dangling-edge': 'dangling-edge',
  'self-loop': 'self-edge',
  'parallel-edge': 'duplicate-relationship',
};

const SECTION_ORDER: Readonly<Record<string, number>> = { nodes: 0, edges: 1, diagram: 2 };

/**
 * Stable ordering by document location (section, then array index; whole-section issues first).
 * Issues at the same location keep their input order, so structural issues precede spatial ones.
 */
function byLocation(issues: readonly GraphIssue[]): GraphIssue[] {
  const rank = (i: GraphIssue) => SECTION_ORDER[String(i.path[0])] ?? 3;
  const index = (i: GraphIssue) => (typeof i.path[1] === 'number' ? i.path[1] : -1);
  return [...issues].sort((a, b) => rank(a) - rank(b) || index(a) - index(b));
}

/**
 * Graph-level invariants for a structurally valid document. Pure; returns all issues found.
 * Topology (IDs, endpoints, self-edges, duplicate relationships) is checked by the generic
 * graph core under SPATIAL_GRAPH_POLICY; grid, type, geometry and diagram rules are checked here.
 */
export function checkGraphInvariants(doc: DesignDocument, options: ValidationOptions = {}): GraphIssue[] {
  const limits: GraphLimits = { ...DEFAULT_LIMITS, ...options.limits };
  const knownTypes = options.knownTypeIds ? new Set(options.knownTypeIds) : undefined;
  const structural = validateGraph(designGraph(doc)).map((si) =>
    issue(si.path, STRUCTURAL_TO_DOCUMENT_CODE[si.code], si.message),
  );
  const issues: GraphIssue[] = [];

  if (doc.nodes.length > limits.maxNodes) {
    issues.push(
      issue(['nodes'], 'too-many-nodes', `document has ${doc.nodes.length} nodes; the limit is ${limits.maxNodes}`),
    );
  }

  const nodeIndexById = new Map<string, number>();
  const nodeIdByCell = new Map<string, string>();

  doc.nodes.forEach((node, i) => {
    if (!nodeIndexById.has(node.id)) nodeIndexById.set(node.id, i);

    node.grid.forEach((c, axis) => {
      if (Math.abs(c) > limits.maxAbsCoordinate) {
        issues.push(
          issue(
            ['nodes', i, 'grid', axis],
            'coordinate-out-of-range',
            `coordinate ${c} exceeds the limit of ±${limits.maxAbsCoordinate}`,
          ),
        );
      }
    });

    const key = gridKey(node.grid);
    const occupant = nodeIdByCell.get(key);
    if (occupant !== undefined) {
      issues.push(
        issue(
          ['nodes', i, 'grid'],
          'duplicate-grid-cell',
          `cell ${fmt(node.grid)} is already occupied by node "${occupant}"`,
        ),
      );
    } else {
      nodeIdByCell.set(key, node.id);
    }

    if (knownTypes && !knownTypes.has(node.typeId)) {
      issues.push(issue(['nodes', i, 'typeId'], 'unknown-node-type', `unknown node type "${node.typeId}"`));
    }
  });

  doc.edges.forEach((edge, i) => {
    // Self-edges and dangling endpoints are reported by the generic structural check.
    if (edge.source === edge.target) return;
    const sourceIndex = nodeIndexById.get(edge.source);
    const targetIndex = nodeIndexById.get(edge.target);
    if (sourceIndex === undefined || targetIndex === undefined) return;
    const a = doc.nodes[sourceIndex]!;
    const b = doc.nodes[targetIndex]!;
    if (!isEdgeGeometryValid(edge.kind, a.grid, b.grid)) {
      issues.push(
        issue(
          ['edges', i, 'kind'],
          'invalid-edge-geometry',
          `"${edge.kind}" edge "${edge.id}" requires ${edgeGeometryRequirement(edge.kind)}; ` +
            `"${a.id}" ${fmt(a.grid)} and "${b.id}" ${fmt(b.grid)} are not`,
        ),
      );
    }
  });

  for (const nodeId of Object.keys(doc.diagram.positions)) {
    if (!nodeIndexById.has(nodeId)) {
      issues.push(
        issue(
          ['diagram', 'positions', nodeId],
          'unknown-node-position',
          `diagram position refers to missing node "${nodeId}"`,
        ),
      );
    }
  }

  return byLocation([...structural, ...issues]);
}
