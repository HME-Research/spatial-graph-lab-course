import type { core as zcore } from 'zod';
import { validateGraph, type StructuralIssueCode } from '@core/graph';
import { gridKey } from '@core/spatial';
import { DEFAULT_LIMITS, type GraphLimits } from './limits';
import { fail, issue, ok, type GraphIssue, type IssueCode, type Result } from './errors';
import { SPATIAL_GRAPH_POLICY } from './graph';
import { MAX_ROOM_CELLS, SCHEMA_VERSION_V2 } from './constants';
import { footprintBox, footprintCellCount, footprintCells } from './footprint';
import { designDocumentV2Schema, type DesignDocumentV2 } from './schema';

/**
 * Validation of schema-v2 documents — FROZEN Gate 0 policy.
 *
 * Graph validity is STRUCTURAL ONLY: ids, endpoints, no self-edges, one relationship per
 * unordered pair, plus room footprint rules (integer boxes inside the
 * coordinate limits, no overlapping rooms, unique display ids). A relationship between rooms
 * that do not touch is VALID; whether it can be built (direct / routed / unresolved) is derived
 * by app/spatial and is never a validation error.
 */

export interface ValidationOptionsV2 {
  /**
   * Optional node-type registry. When supplied, every node's `function` must be in it.
   * When omitted, only the functionId format is checked.
   */
  readonly knownTypeIds?: Iterable<string>;
  readonly limits?: Partial<GraphLimits>;
  /** Total occupied room cells (default MAX_ROOM_CELLS). */
  readonly maxCells?: number;
}

const fmt = (g: readonly number[]): string => `[${g.join(', ')}]`;

const STRUCTURAL_TO_DOCUMENT_CODE: Readonly<Record<StructuralIssueCode, IssueCode>> = {
  'duplicate-node-id': 'duplicate-node-id',
  'duplicate-edge-id': 'duplicate-edge-id',
  'dangling-edge': 'dangling-edge',
  'self-loop': 'self-edge',
  'parallel-edge': 'duplicate-relationship',
};

const SECTION_ORDER: Readonly<Record<string, number>> = { nodes: 0, edges: 1, diagram: 2, settings: 3 };

function byLocation(issues: readonly GraphIssue[]): GraphIssue[] {
  const rank = (i: GraphIssue) => SECTION_ORDER[String(i.path[0])] ?? 4;
  const index = (i: GraphIssue) => (typeof i.path[1] === 'number' ? i.path[1] : -1);
  return [...issues].sort((a, b) => rank(a) - rank(b) || index(a) - index(b));
}

const mapZodIssues = (issues: readonly zcore.$ZodIssue[]): GraphIssue[] =>
  issues.map((zi) => issue(zi.path.map((p) => (typeof p === 'symbol' ? String(p) : p)), 'schema', zi.message));

/** Validate an unknown value as a schema-v2 document (the only document format). Never throws. */
export function validateDocumentV2(input: unknown, options: ValidationOptionsV2 = {}): Result<DesignDocumentV2> {
  if (typeof input === 'object' && input !== null && !Array.isArray(input) && 'schemaVersion' in input) {
    const version = (input as { schemaVersion: unknown }).schemaVersion;
    if (version !== SCHEMA_VERSION_V2) {
      return fail([
        issue(
          ['schemaVersion'],
          'unsupported-schema-version',
          `unsupported schemaVersion ${JSON.stringify(version)}; this application reads version ${SCHEMA_VERSION_V2} only`,
        ),
      ]);
    }
  }
  const parsed = designDocumentV2Schema.safeParse(input);
  if (!parsed.success) return fail(mapZodIssues(parsed.error.issues));
  const issues = checkDocumentV2Invariants(parsed.data, options);
  return issues.length > 0 ? fail(issues) : ok(parsed.data);
}

/** Structural and footprint invariants of a structurally parsed v2 document. Pure. */
export function checkDocumentV2Invariants(doc: DesignDocumentV2, options: ValidationOptionsV2 = {}): GraphIssue[] {
  const limits: GraphLimits = { ...DEFAULT_LIMITS, ...options.limits };
  const maxCells = options.maxCells ?? MAX_ROOM_CELLS;
  const knownTypes = options.knownTypeIds ? new Set(options.knownTypeIds) : undefined;
  const structural = validateGraph({ policy: SPATIAL_GRAPH_POLICY, nodes: doc.nodes, edges: doc.edges }).map((si) =>
    issue(si.path, STRUCTURAL_TO_DOCUMENT_CODE[si.code], si.message),
  );
  const issues: GraphIssue[] = [];

  if (doc.nodes.length > limits.maxNodes) {
    issues.push(issue(['nodes'], 'too-many-nodes', `document has ${doc.nodes.length} nodes; the limit is ${limits.maxNodes}`));
  }

  const totalCells = doc.nodes.reduce((sum, n) => sum + footprintCellCount(n), 0);
  const cellsChecked = totalCells <= maxCells;
  if (!cellsChecked) {
    issues.push(issue(['nodes'], 'too-many-cells', `rooms occupy ${totalCells} cells; the limit is ${maxCells}`));
  }

  const nodeIds = new Set<number>();
  const occupant = new Map<string, number>();

  doc.nodes.forEach((node, i) => {
    nodeIds.add(node.id);
    const { min, max } = footprintBox(node);
    for (let axis = 0; axis < 3; axis++) {
      if (Math.abs(min[axis]!) > limits.maxAbsCoordinate) {
        issues.push(
          issue(['nodes', i, 'position', axis], 'coordinate-out-of-range', `coordinate ${min[axis]} exceeds the limit of ±${limits.maxAbsCoordinate}`),
        );
      } else if (Math.abs(max[axis]!) > limits.maxAbsCoordinate) {
        issues.push(
          issue(
            ['nodes', i, 'size', axis],
            'coordinate-out-of-range',
            `room extends to coordinate ${max[axis]}, beyond the limit of ±${limits.maxAbsCoordinate}`,
          ),
        );
      }
    }

    if (node.id >= doc.nextNodeId) {
      issues.push(issue(['nodes', i, 'id'], 'id-counter', `node id ${node.id} is not below nextNodeId ${doc.nextNodeId}; new ids would repeat it`));
    }

    if (cellsChecked) {
      for (const cell of footprintCells(node)) {
        const key = gridKey(cell);
        const other = occupant.get(key);
        if (other !== undefined && other !== node.id) {
          issues.push(issue(['nodes', i, 'position'], 'room-overlap', `room "${node.id}" overlaps room "${other}" at cell ${fmt(cell)}`));
          break; // one issue per room
        }
        occupant.set(key, node.id);
      }
    }

    if (knownTypes && !knownTypes.has(node.function)) {
      issues.push(issue(['nodes', i, 'function'], 'unknown-node-type', `unknown node type "${node.function}"`));
    }
  });

  doc.edges.forEach((edge, i) => {
    if (edge.id >= doc.nextEdgeId) {
      issues.push(issue(['edges', i, 'id'], 'id-counter', `edge id ${edge.id} is not below nextEdgeId ${doc.nextEdgeId}; new ids would repeat it`));
    }
  });

  // Diagram positions are keyed by the node id written as a JSON key ("3").
  for (const key of Object.keys(doc.diagram.positions)) {
    if (!(/^(0|[1-9][0-9]*)$/.test(key) && nodeIds.has(Number(key)))) {
      issues.push(issue(['diagram', 'positions', key], 'unknown-node-position', `diagram position refers to missing node ${key}`));
    }
  }
  // Style cards for values no room has (or attributes the project does not define) are tolerated:
  // the Designer reports them, validation does not.

  return byLocation([...structural, ...issues]);
}
