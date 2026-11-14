/** Current design document schema version. Changing this requires a migration plan. */
export const SCHEMA_VERSION = 1 as const;

/** Edges between horizontally face-adjacent cells (same z, one step in x or y). */
export const HORIZONTAL_EDGE_KINDS = ['door', 'open'] as const;

/**
 * Edges between vertically face-adjacent cells (same x/y, one step in z).
 * Conceptual relationships only: not a validated staircase or shaft.
 */
export const VERTICAL_EDGE_KINDS = ['atrium', 'vertical-access'] as const;

export const EDGE_KINDS = [...HORIZONTAL_EDGE_KINDS, ...VERTICAL_EDGE_KINDS] as const;

export type HorizontalEdgeKind = (typeof HORIZONTAL_EDGE_KINDS)[number];
export type VerticalEdgeKind = (typeof VERTICAL_EDGE_KINDS)[number];
export type EdgeKind = (typeof EDGE_KINDS)[number];

/** Safety limits for sparse documents. The grid itself is unbounded in principle. */
export interface GraphLimits {
  readonly maxNodes: number;
  /** Maximum absolute value of any single grid coordinate. */
  readonly maxAbsCoordinate: number;
}

export const DEFAULT_LIMITS: GraphLimits = {
  maxNodes: 2000,
  maxAbsCoordinate: 1000,
};
