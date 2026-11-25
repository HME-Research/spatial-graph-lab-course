import { DEFAULT_CELL_SIZE } from '@core/viewer/coordinates';
import { actualArea, boundaryShiftsOf } from '@app/building';
import type { ComputedMetric, MetricContext } from './contracts';
import { exteriorWallFaceCounts } from './faces';

/**
 * The curated, built-in catalogue of calculated (read-only) values (workstream M). Every metric is
 * pure and deterministic, reads only what its `dependsOn` declares, and is derived on read: values
 * are never stored in the design, the project file or undo history.
 *
 * Units use the central cell size (`DEFAULT_CELL_SIZE`: 3 m wide, 3 m storey height).
 */

/** A catalogue metric: the Gate F contract plus the definition text shown to students. */
export interface CatalogueMetric extends ComputedMetric {
  /** One or two plain sentences: exactly what is counted or measured. */
  readonly definition: string;
}

const CELL = DEFAULT_CELL_SIZE.horizontal;
const STOREY = DEFAULT_CELL_SIZE.vertical;

const nodeOf = ({ doc }: MetricContext, nodeId: number) => doc.nodes.find((n) => n.id === nodeId);

// ── Node metrics ──────────────────────────────────────────────────────────────────────────────

/**
 * Node footprint (plan) area in m²: size x × size y cells at the central cell size (3 m). The id
 * stays `area` (student code reads it); since boundary shifts (2026-11-24) it is labelled the
 * NOMINAL area, beside `actual-area`.
 */
export const areaMetric: CatalogueMetric = {
  id: 'area',
  label: 'Nominal area',
  collection: 'nodes',
  valueKind: 'number',
  unit: 'm²',
  dependsOn: ['geometry'],
  definition:
    'Plan (footprint) area of the room on the 3 m grid: cells along x × cells along y × 3 m × 3 m. Boundary shifts do not change it. The same on every storey of a multi-storey room; not summed over storeys.',
  compute: (ctx, nodeId) => {
    const node = nodeOf(ctx, nodeId);
    return node ? node.size[0] * node.size[1] * CELL * CELL : null;
  },
};

export const volumeMetric: CatalogueMetric = {
  id: 'volume',
  label: 'Volume',
  collection: 'nodes',
  valueKind: 'number',
  unit: 'm³',
  dependsOn: ['geometry'],
  definition: 'Gross volume of the room box: cells along x × y × z × 3 m × 3 m × 3 m (storey height 3 m). Wall and slab thickness are ignored.',
  compute: (ctx, nodeId) => {
    const node = nodeOf(ctx, nodeId);
    return node ? node.size[0] * node.size[1] * node.size[2] * CELL * CELL * STOREY : null;
  },
};

/** Number of relationships incident to the node (a self-loop would count twice). */
export const degreeMetric: CatalogueMetric = {
  id: 'degree',
  label: 'Degree',
  collection: 'nodes',
  valueKind: 'number',
  dependsOn: ['topology'],
  definition: 'Number of edges (Access or Open) that end at this node, whether or not they can be built.',
  compute: ({ doc }, nodeId) => {
    if (!doc.nodes.some((n) => n.id === nodeId)) return null;
    let degree = 0;
    for (const e of doc.edges) degree += (e.source === nodeId ? 1 : 0) + (e.target === nodeId ? 1 : 0);
    return degree;
  },
};

/** Exterior faces depend on the cells of rooms (geometry), of connectors (topology + resolution). */
const FACE_DEPENDENCIES = ['geometry', 'topology', 'resolution'] as const;

export const hasExteriorFacadeMetric: CatalogueMetric = {
  id: 'has-exterior-facade',
  label: 'Has exterior façade',
  collection: 'nodes',
  valueKind: 'boolean',
  dependsOn: FACE_DEPENDENCIES,
  definition: 'Yes when at least one wall face of the room (on any storey) faces an empty cell, i.e. is an exterior façade in the Building view. Roofs and floors do not count.',
  compute: (ctx, nodeId) => {
    const count = exteriorWallFaceCounts(ctx).get(nodeId);
    return count === undefined ? null : count > 0;
  },
};

export const exposedFacadeLengthMetric: CatalogueMetric = {
  id: 'exposed-facade-length',
  label: 'Exposed façade length',
  collection: 'nodes',
  valueKind: 'number',
  unit: 'm',
  dependsOn: FACE_DEPENDENCIES,
  definition:
    'Length of exterior wall, summed over the storeys of the room: number of exterior unit wall faces × 3 m. Walls shared with another room or touching a generated connector are not exterior.',
  compute: (ctx, nodeId) => {
    const count = exteriorWallFaceCounts(ctx).get(nodeId);
    return count === undefined ? null : count * CELL;
  },
};

export const exposedFacadeAreaMetric: CatalogueMetric = {
  id: 'exposed-facade-area',
  label: 'Exposed façade area',
  collection: 'nodes',
  valueKind: 'number',
  unit: 'm²',
  dependsOn: FACE_DEPENDENCIES,
  definition: 'Gross area of exterior wall: number of exterior unit wall faces × 3 m × 3 m (windows included).',
  compute: (ctx, nodeId) => {
    const count = exteriorWallFaceCounts(ctx).get(nodeId);
    return count === undefined ? null : count * CELL * STOREY;
  },
};

export const unresolvedConnectionsMetric: CatalogueMetric = {
  id: 'unresolved-connections',
  label: 'Unresolved edges',
  collection: 'nodes',
  valueKind: 'number',
  dependsOn: ['topology', 'resolution'],
  definition: 'Number of edges of this node that cannot be built (status unresolved: different storeys, not aligned, blocked, or the chosen wall is no longer shared).',
  compute: ({ doc, spatial }, nodeId) => {
    if (!doc.nodes.some((n) => n.id === nodeId)) return null;
    let count = 0;
    for (const e of doc.edges) {
      if ((e.source === nodeId || e.target === nodeId) && spatial.byEdge.get(e.id)?.status === 'unresolved') count++;
    }
    return count;
  },
};

/** Boundary shifts read the edges' requests (topology signature) and the built relationships (resolution). */
const SHIFT_DEPENDENCIES = ['topology', 'geometry', 'resolution'] as const;
const shiftsOf = ({ doc, spatial }: MetricContext) => boundaryShiftsOf(doc, spatial);

/** Realised plan area after applied boundary shifts (m²). */
export const actualAreaMetric: CatalogueMetric = {
  id: 'actual-area',
  label: 'Actual area',
  collection: 'nodes',
  valueKind: 'number',
  unit: 'm²',
  dependsOn: SHIFT_DEPENDENCIES,
  definition:
    'Plan (footprint) area of the room as built: the nominal area, less 1.5 m × the shared wall length when an applied boundary shift moves the wall into this room, or plus it when the wall moves into the other room. Not summed over storeys.',
  compute: (ctx, nodeId) => {
    const node = nodeOf(ctx, nodeId);
    return node ? actualArea(node, ctx.doc, shiftsOf(ctx), CELL) : null;
  },
};

export const boundaryAdjustedMetric: CatalogueMetric = {
  id: 'boundary-adjusted',
  label: 'Boundary adjusted',
  collection: 'nodes',
  valueKind: 'boolean',
  dependsOn: SHIFT_DEPENDENCIES,
  definition: 'Yes when the room takes part in an APPLIED boundary shift (it gains or loses area). A room takes part in at most one.',
  compute: (ctx, nodeId) => (nodeOf(ctx, nodeId) ? shiftsOf(ctx).byNode.has(nodeId) : null),
};

// ── Edge metrics ──────────────────────────────────────────────────────────────────────────────

export const resolutionStatusMetric: CatalogueMetric = {
  id: 'resolution-status',
  label: 'Spatial status',
  collection: 'edges',
  valueKind: 'text',
  dependsOn: ['resolution'],
  definition: 'How the edge is built: "direct" (the rooms touch), "routed" (a generated straight connector) or "unresolved" (kept, but not built).',
  compute: ({ spatial }, edgeId) => spatial.byEdge.get(edgeId)?.status ?? null,
};

export const routeLengthMetric: CatalogueMetric = {
  id: 'route-length',
  label: 'Connector length',
  collection: 'edges',
  valueKind: 'number',
  unit: 'm',
  dependsOn: ['resolution'],
  definition: 'Length of the generated connector between the two rooms: connector cells × 3 m. 0 when the rooms touch (direct); no value when unresolved.',
  compute: ({ spatial }, edgeId) => {
    const r = spatial.byEdge.get(edgeId);
    if (!r) return null;
    if (r.status === 'routed') return r.route.cells.length * CELL;
    return r.status === 'direct' ? 0 : null;
  },
};

export const boundaryShiftAppliedMetric: CatalogueMetric = {
  id: 'boundary-shift-applied',
  label: 'Boundary shift applied',
  collection: 'edges',
  valueKind: 'boolean',
  dependsOn: SHIFT_DEPENDENCIES,
  definition: 'Yes only when the edge requests a boundary shift AND the building applies it. A request that cannot be applied is kept, but reads No.',
  compute: (ctx, edgeId) => shiftsOf(ctx).byEdge.get(edgeId)?.applied ?? null,
};

export const boundaryShiftStatusMetric: CatalogueMetric = {
  id: 'boundary-shift-status',
  label: 'Boundary shift status',
  collection: 'edges',
  valueKind: 'text',
  dependsOn: SHIFT_DEPENDENCIES,
  definition:
    '"applied", "no-request", or why the requested shift is not applied: "stacked-rooms", "storey-mismatch", "not-touching", "partial-wall", "room-already-adjusted", "opening-conflict" or "overlapping-adjustment". Requests are resolved in stored edge order.',
  compute: (ctx, edgeId) => shiftsOf(ctx).byEdge.get(edgeId)?.status ?? null,
};

/** The built-in catalogue, in display order (node metrics, then edge metrics). */
export const METRIC_CATALOGUE: readonly CatalogueMetric[] = Object.freeze([
  areaMetric,
  actualAreaMetric,
  boundaryAdjustedMetric,
  volumeMetric,
  degreeMetric,
  hasExteriorFacadeMetric,
  exposedFacadeLengthMetric,
  exposedFacadeAreaMetric,
  unresolvedConnectionsMetric,
  resolutionStatusMetric,
  routeLengthMetric,
  boundaryShiftAppliedMetric,
  boundaryShiftStatusMetric,
]);
