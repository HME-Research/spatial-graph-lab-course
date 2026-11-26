import type {
  AttributeValue,
  CustomFieldInfo,
  GraphPolicy,
  GridCoord,
  MetricReader,
  SpatialAlgorithmContext,
  SpatialEdge,
  SpatialNode,
} from '@student-api';
import type { MetricTable } from './designAnalysisContext';

/**
 * Uploaded transforms (owner 2026-11-25): the `SpatialAlgorithmContext` of an uploaded transform,
 * built INSIDE the upload Web Worker from PLAIN DATA that the main thread prepares
 * (`buildTransformRunData` in `uploadedTransforms.ts`). It answers exactly as the toolkit context
 * (`buildSpatialContextV2` in `context.ts`) on the same document: the main thread computes every
 * answer that needs the app (occupied cells, touching pairs by `roomContact`, related pairs,
 * effective custom values by the same resolver, every calculated value), and this module only looks
 * them up. Pure; imports only `@student-api` types, so the worker bundle stays small.
 *
 * `customOf` needs a toolkit's Function definition objects, which an uploaded file cannot import:
 * it throws a readable refusal pointing to `ctx.nodeCustom(nodeId)`.
 */

/** Everything an uploaded transform may read, as plain data (structured-cloned into the worker). */
export interface TransformRunData {
  /** Deep copies of the design's rooms and relationships (with their stored `custom`), and the graph policy. */
  readonly design: { readonly policy: GraphPolicy; readonly nodes: readonly SpatialNode[]; readonly edges: readonly SpatialEdge[] };
  /** The project's custom fields (`ctx.customFields`). */
  readonly customFields: { readonly nodes: readonly CustomFieldInfo[]; readonly edges: readonly CustomFieldInfo[] };
  /** Effective values of every custom node field, per node id (`ctx.nodeCustom`). */
  readonly nodeCustom: readonly (readonly [number, { readonly [key: string]: AttributeValue }])[];
  /** Effective values of every custom edge field, per edge id (`ctx.edgeCustom`). */
  readonly edgeCustom: readonly (readonly [number, { readonly [key: string]: AttributeValue }])[];
  /** Every occupied cell and its room: `[x, y, z, nodeId]` (`ctx.nodeAt`). */
  readonly occupied: readonly (readonly [number, number, number, number])[];
  /** Every pair of rooms that share a face, smaller id first (`ctx.touches`). */
  readonly touching: readonly (readonly [number, number])[];
  /** Every pair of rooms already related by an edge, smaller id first (`ctx.canRelate`). */
  readonly related: readonly (readonly [number, number])[];
  /** Every calculated value of every node and edge (`ctx.metrics`). */
  readonly metrics: MetricTable;
}

/** The refusal of `ctx.customOf` in an uploaded transform. */
export const CUSTOM_OF_REFUSAL =
  "customOf needs a Function from a toolkit's functions/ folder, which an uploaded file cannot import. In an uploaded transform, read a room's fields with ctx.nodeCustom(nodeId).";

function freezeDeep<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) freezeDeep(v);
  }
  return value;
}

const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
const isId = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isCell = (c: unknown): c is GridCoord => Array.isArray(c) && c.length === 3 && c.every((v) => typeof v === 'number' && Number.isInteger(v));

/**
 * The context of one uploaded transform run. `params` are already validated (defaults applied);
 * `metrics` reads `data.metrics` (`tableMetricReader`); `fail` makes the error a run stops with (its
 * message is shown as it is). Every value handed out is a frozen copy.
 */
export function uploadedTransformContext(
  data: TransformRunData,
  params: { readonly [key: string]: AttributeValue },
  metrics: MetricReader,
  fail: (message: string) => Error,
): SpatialAlgorithmContext {
  const design = freezeDeep(structuredClone({ policy: data.design.policy, nodes: data.design.nodes, edges: data.design.edges }));
  const rooms = new Set(design.nodes.map((n) => n.id));
  const occupant = new Map(data.occupied.map(([x, y, z, id]) => [cellKey(x, y, z), id] as const));
  const touching = new Set(data.touching.map(([a, b]) => pairKey(a, b)));
  const related = new Set(data.related.map(([a, b]) => pairKey(a, b)));
  const nodeValues = new Map(data.nodeCustom.map(([id, values]) => [id, values] as const));
  const edgeValues = new Map(data.edgeCustom.map(([id, values]) => [id, values] as const));

  return Object.freeze({
    design,
    params: freezeDeep(structuredClone({ ...params })) as SpatialAlgorithmContext['params'],
    customFields: freezeDeep(structuredClone({ nodes: [...data.customFields.nodes], edges: [...data.customFields.edges] })),
    metrics,
    nodeCustom: (nodeId: number) => {
      const values = isId(nodeId) ? nodeValues.get(nodeId) : undefined;
      if (!values) throw fail(`nodeCustom: there is no node ${String(nodeId)}`);
      return freezeDeep(structuredClone(values));
    },
    edgeCustom: (edgeId: number) => {
      const values = isId(edgeId) ? edgeValues.get(edgeId) : undefined;
      if (!values) throw fail(`edgeCustom: there is no edge ${String(edgeId)}`);
      return freezeDeep(structuredClone(values));
    },
    nodeAt: (cell: GridCoord) => (isCell(cell) ? occupant.get(cellKey(cell[0], cell[1], cell[2])) : undefined),
    touches: (a: number, b: number) => isId(a) && isId(b) && a !== b && rooms.has(a) && rooms.has(b) && touching.has(pairKey(a, b)),
    canRelate: (a: number, b: number) => isId(a) && isId(b) && a !== b && rooms.has(a) && rooms.has(b) && !related.has(pairKey(a, b)),
    customOf: () => {
      throw fail(CUSTOM_OF_REFUSAL);
    },
  });
}
