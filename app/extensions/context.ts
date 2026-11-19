import { unorderedPairKey } from '@core/graph';
import { gridKey } from '@core/spatial';
import {
  type AttributeValue,
  type DesignDocumentV2,
  footprintCells,
  roomContact,
  type RoomNode,
  SPATIAL_GRAPH_POLICY,
} from '@app/document';
import type {
  AttributeSpecs,
  AttributesOf,
  EdgeRecord,
  GraphAlgorithmContext,
  GridCoord,
  NodeRecord,
  FunctionDefinition,
  SpatialAlgorithmContext,
  SpatialNode,
} from '@student-api';
import type { SpatialResolution } from '@app/spatial';
import type { ActiveToolkit } from './activate';
import { checkValue, effectiveAttributes } from './attributes';
import { diagnostic, type ExtensionDiagnostic } from './diagnostics';
import { createMetricReader } from './metricReader';
import { EMPTY_ATTRIBUTE_SCHEMA, fieldForKey, type AttributeField, type ProjectAttributeSchema } from './projectAttributes';
import { effectiveEdgeValues, effectiveNodeValues } from './resolveAttributes';

/**
 * Builds algorithm contexts from a document. Safety comes from copying: every context holds a
 * fresh copy of plain data, so nothing an algorithm does can reach the application's document.
 * Plain data is additionally frozen only so that mutation attempts fail loudly (a debugging aid,
 * not the safety mechanism). Query functions close over private lookup tables.
 */

/** Thrown inside a run to fail it with a specific diagnostic (caught by runAlgorithmV2). */
export class ExtensionRunError extends Error {
  constructor(readonly diagnostic: ExtensionDiagnostic) {
    super(diagnostic.message);
  }
}

export function freezeDeep<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) freezeDeep(v);
  }
  return value;
}

/** The parts of a document a graph analysis may see. */
export interface GraphSource {
  readonly nodes: readonly { readonly id: number }[];
  readonly edges: readonly { readonly id: number; readonly source: number; readonly target: number }[];
}

/** A graph analysis context: ids and endpoints only, and the (already checked) picked inputs. */
export function buildGraphContext(doc: GraphSource, inputs: readonly number[]): GraphAlgorithmContext {
  const nodes: NodeRecord[] = doc.nodes.map((n) => ({ id: n.id }));
  const edges: EdgeRecord[] = doc.edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));
  return freezeDeep({ graph: { policy: { ...SPATIAL_GRAPH_POLICY }, nodes, edges }, inputs: [...inputs] });
}

const isGrid = (g: unknown): g is GridCoord =>
  Array.isArray(g) && g.length === 3 && g.every((c) => typeof c === 'number' && Number.isInteger(c));

/**
 * Spatial context for a VALIDATED schema-v2 document. `spatial` is the host's resolution of `doc`
 * (with the scenario's face preferences) for `ctx.metrics`; omitted, it is `resolveRelationships(doc)`.
 */
export function buildSpatialContextV2<P extends AttributeSpecs>(
  doc: DesignDocumentV2,
  project: ActiveToolkit,
  algorithmId: string,
  params: AttributesOf<P>,
  schema: ProjectAttributeSchema = project.attributeBaseline?.schema ?? EMPTY_ATTRIBUTE_SCHEMA,
  spatial?: SpatialResolution,
): SpatialAlgorithmContext<P> {
  const design = freezeDeep({
    policy: { ...SPATIAL_GRAPH_POLICY },
    nodes: structuredClone(doc.nodes),
    edges: structuredClone(doc.edges),
  });
  const occupant = new Map<string, number>();
  for (const n of doc.nodes) for (const cell of footprintCells(n)) occupant.set(gridKey(cell), n.id);
  const rooms = new Map<number, RoomNode>(structuredClone(doc.nodes).map((n) => [n.id, n] as const));
  const links = new Map(structuredClone(doc.edges).map((e) => [e.id, e] as const));
  const pairs = new Set(doc.edges.map((e) => unorderedPairKey(e.source, e.target)));
  const isId = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
  const subject = { kind: 'algorithm', id: algorithmId } as const;
  const runError = (code: 'type-not-registered' | 'broken-node-type' | 'type-mismatch' | 'unknown-node-reference' | 'unknown-metric', message: string) =>
    new ExtensionRunError(diagnostic(code, 'error', subject, message));
  // The same resolver as the app's views and Properties (docs/PROJECT-ATTRIBUTES.md).
  const fieldInfo = (f: AttributeField) => ({
    key: f.key,
    label: f.label,
    kind: f.kind,
    ...(f.values !== undefined && { values: [...f.values] }),
    ...(f.min !== undefined && { min: f.min }),
    ...(f.max !== undefined && { max: f.max }),
    ...(f.default !== undefined && { default: f.default }),
    ...(f.description !== undefined && { description: f.description }),
  });
  const customFields = freezeDeep({ nodes: schema.nodes.map(fieldInfo), edges: schema.edges.map(fieldInfo) });

  return Object.freeze({
    design,
    params: freezeDeep(structuredClone(params)),
    customFields,
    metrics: createMetricReader(doc, spatial, runError),
    nodeCustom: (nodeId: number) => {
      const node = isId(nodeId) ? rooms.get(nodeId) : undefined;
      if (!node) throw runError('unknown-node-reference', `nodeCustom: there is no node ${String(nodeId)}`);
      return freezeDeep(effectiveNodeValues(schema, node));
    },
    edgeCustom: (edgeId: number) => {
      const edge = isId(edgeId) ? links.get(edgeId) : undefined;
      if (!edge) throw runError('unknown-node-reference', `edgeCustom: there is no edge ${String(edgeId)}`);
      return freezeDeep(effectiveEdgeValues(schema, edge));
    },
    nodeAt: (cell: GridCoord) => (isGrid(cell) ? occupant.get(gridKey([cell[0], cell[1], cell[2]])) : undefined),
    touches: (a: number, b: number) => {
      const ra = isId(a) ? rooms.get(a) : undefined;
      const rb = isId(b) ? rooms.get(b) : undefined;
      return ra !== undefined && rb !== undefined && a !== b && roomContact(ra, rb) !== null;
    },
    canRelate: (a: number, b: number) =>
      isId(a) && isId(b) && a !== b && rooms.has(a) && rooms.has(b) && !pairs.has(unorderedPairKey(a, b)),
    customOf<A extends AttributeSpecs>(node: SpatialNode, fn: FunctionDefinition<A>): AttributesOf<A> {
      const entry = project.functions.find((t) => t.definition === fn);
      const name = typeof fn === 'object' && fn !== null && typeof fn.id === 'string' ? `"${fn.id}"` : 'the given value';
      if (!entry) {
        throw runError('type-not-registered', `customOf: ${name} is not a function definition registered by toolkit "${project.id}" (import it from the toolkit's functions/ folder)`);
      }
      if (!entry.status.ok) {
        throw runError('broken-node-type', `customOf: function "${entry.id}" (${entry.file}) is invalid, so algorithms cannot use it`);
      }
      if (node?.function !== entry.id) {
        throw runError('type-mismatch', `customOf: node "${node?.id}" has function "${node?.function}", not "${entry.id}"`);
      }
      // The type's declared keys, read through the project fields (same values as the app). A key
      // the project schema no longer has keeps the Stage 3 per-type reading. Explicit "no value"
      // (null) and values that do not fit the type's own declaration read as the type default.
      const specs = entry.definition.custom ?? {};
      const projectValues = effectiveNodeValues(schema, node);
      const legacy = effectiveAttributes(specs, node.custom);
      const out: Record<string, AttributeValue> = {};
      for (const [key, spec] of Object.entries(specs)) {
        const field = fieldForKey(schema, 'nodes', key);
        const value = field ? projectValues[field.key] : legacy[key];
        const usable = value !== undefined && value !== null && checkValue(spec, value) === 'ok' ? value : spec.default;
        if (usable !== undefined) out[key] = usable;
      }
      return freezeDeep(out) as AttributesOf<A>;
    },
  });
}
