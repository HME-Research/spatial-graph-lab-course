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
