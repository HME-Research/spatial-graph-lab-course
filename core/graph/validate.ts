import type { core as zcore } from 'zod';
import {
  edgeGeometryRequirement,
  gridKey,
  isEdgeGeometryValid,
  unorderedPairKey,
} from './adjacency';
import { DEFAULT_LIMITS, SCHEMA_VERSION, type GraphLimits } from './constants';
import { fail, issue, ok, type GraphIssue, type Result } from './errors';
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

/** Graph-level invariants for a structurally valid document. Pure; returns all issues found. */
export function checkGraphInvariants(doc: DesignDocument, options: ValidationOptions = {}): GraphIssue[] {
  const limits: GraphLimits = { ...DEFAULT_LIMITS, ...options.limits };
  const knownTypes = options.knownTypeIds ? new Set(options.knownTypeIds) : undefined;
  const issues: GraphIssue[] = [];

  if (doc.nodes.length > limits.maxNodes) {
    issues.push(
      issue(['nodes'], 'too-many-nodes', `document has ${doc.nodes.length} nodes; the limit is ${limits.maxNodes}`),
    );
  }

  const nodeIndexById = new Map<string, number>();
  const nodeIdByCell = new Map<string, string>();

  doc.nodes.forEach((node, i) => {
    const firstIndex = nodeIndexById.get(node.id);
    if (firstIndex !== undefined) {
      issues.push(
        issue(['nodes', i, 'id'], 'duplicate-node-id', `duplicate node id "${node.id}" (first used at nodes[${firstIndex}])`),
      );
    } else {
      nodeIndexById.set(node.id, i);
    }

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

  const edgeIndexById = new Map<string, number>();
  const edgeIdByPair = new Map<string, string>();

  doc.edges.forEach((edge, i) => {
    const firstIndex = edgeIndexById.get(edge.id);
    if (firstIndex !== undefined) {
      issues.push(
        issue(['edges', i, 'id'], 'duplicate-edge-id', `duplicate edge id "${edge.id}" (first used at edges[${firstIndex}])`),
      );
    } else {
      edgeIndexById.set(edge.id, i);
    }

    if (edge.source === edge.target) {
      issues.push(issue(['edges', i], 'self-edge', `edge "${edge.id}" connects node "${edge.source}" to itself`));
      return;
    }

    const sourceIndex = nodeIndexById.get(edge.source);
    const targetIndex = nodeIndexById.get(edge.target);
    if (sourceIndex === undefined) {
      issues.push(
        issue(['edges', i, 'source'], 'dangling-edge', `edge "${edge.id}" references missing node "${edge.source}"`),
      );
    }
    if (targetIndex === undefined) {
      issues.push(
        issue(['edges', i, 'target'], 'dangling-edge', `edge "${edge.id}" references missing node "${edge.target}"`),
      );
    }

    const pair = unorderedPairKey(edge.source, edge.target);
    const existing = edgeIdByPair.get(pair);
    if (existing !== undefined) {
      issues.push(
        issue(
          ['edges', i],
          'duplicate-relationship',
          `edge "${edge.id}" duplicates edge "${existing}": only one relationship is allowed between "${edge.source}" and "${edge.target}"`,
        ),
      );
    } else {
      edgeIdByPair.set(pair, edge.id);
    }

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

  return issues;
}
