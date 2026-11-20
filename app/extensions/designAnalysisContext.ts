import {
  roomCells,
  type CustomFieldInfo,
  type DesignAnalysisContext,
  type FunctionInfo,
  type GraphPolicy,
  type GridCoord,
  type MetricInfo,
  type MetricReader,
  type SpatialEdge,
  type SpatialNode,
} from '@student-api';

/**
 * Design analyses (owner 2026-11-20): the context a design analysis runs with, built from PLAIN
 * DATA so the same code serves a toolkit analysis (main thread, `run.ts`) and an uploaded one (in
 * the upload Web Worker, `uploadSandbox.ts`, which receives the data by `postMessage`). Pure; imports
 * only `@student-api` so the worker bundle stays small.
 */

/** What a design analysis may see, as plain data (`buildDesignAnalysisData` in `context.ts`). */
export interface DesignAnalysisData {
  /** Rooms and relationships; `custom` already holds only the fields listed in `uses`. */
  readonly design: { readonly policy: GraphPolicy; readonly nodes: readonly SpatialNode[]; readonly edges: readonly SpatialEdge[] };
  readonly functions: readonly FunctionInfo[];
  readonly customFields: { readonly nodes: readonly CustomFieldInfo[]; readonly edges: readonly CustomFieldInfo[] };
  /** Every pair of rooms that share a face, smaller id first. */
  readonly touching: readonly (readonly [number, number])[];
}

/** Every calculated value of every item, for the worker (it cannot call the app's evaluator). */
export interface MetricTable {
  readonly list: readonly MetricInfo[];
  /** metric id → [item id, value] pairs (every node or edge of the metric's collection). */
  readonly values: { readonly [metricId: string]: readonly (readonly [number, number | boolean | string | null])[] };
}

export type ContextFailure = (code: 'unknown-metric' | 'unknown-node-reference', message: string) => Error;

function freezeDeep<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) freezeDeep(v);
  }
  return value;
}

const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
const isCell = (c: unknown): c is GridCoord => Array.isArray(c) && c.length === 3 && c.every((v) => typeof v === 'number' && Number.isInteger(v));

/** The context of one run: a fresh, frozen copy of `data`, the picked inputs and the metric reader. */
export function designAnalysisContext(data: DesignAnalysisData, inputs: readonly number[], metrics: MetricReader): DesignAnalysisContext {
  const design = freezeDeep(structuredClone({ policy: data.design.policy, nodes: data.design.nodes, edges: data.design.edges }));
  const occupant = new Map<string, number>();
  for (const n of design.nodes) for (const [x, y, z] of roomCells(n)) occupant.set(cellKey(x, y, z), n.id);
  const pairs = new Set(data.touching.map(([a, b]) => `${a}:${b}`));
  return Object.freeze({
    design,
    inputs: Object.freeze([...inputs]),
    functions: freezeDeep(structuredClone([...data.functions])),
    customFields: freezeDeep(structuredClone({ nodes: [...data.customFields.nodes], edges: [...data.customFields.edges] })),
    nodeAt: (cell: GridCoord) => (isCell(cell) ? occupant.get(cellKey(cell[0], cell[1], cell[2])) : undefined),
    touches: (a: number, b: number) => typeof a === 'number' && typeof b === 'number' && a !== b && pairs.has(a < b ? `${a}:${b}` : `${b}:${a}`),
    metrics,
  });
}

/** A metric reader over a precomputed table (inside the upload worker). Same messages as the app's reader. */
export function tableMetricReader(table: MetricTable, fail: ContextFailure): MetricReader {
  const list = freezeDeep(structuredClone([...table.list]));
  const byId = new Map(list.map((m) => [m.id, m] as const));
  const values = new Map(Object.entries(table.values).map(([id, pairs]) => [id, new Map(pairs.map(([item, v]) => [item, v] as const))] as const));
  return Object.freeze({
    list: () => list,
    value(metricId: string, itemId: number) {
      const metric = typeof metricId === 'string' ? byId.get(metricId) : undefined;
      if (!metric) throw fail('unknown-metric', `metrics.value: there is no calculated value "${String(metricId)}" (see ctx.metrics.list())`);
      const items = values.get(metric.id);
      if (typeof itemId !== 'number' || !items?.has(itemId)) {
        const what = metric.collection === 'nodes' ? 'node' : 'edge';
        throw fail('unknown-node-reference', `metrics.value: "${metricId}" is a ${what} value and there is no ${what} ${String(itemId)}`);
      }
      return items.get(itemId) ?? null;
    },
  });
}
