import type { FacadeProvider, FacadeSpec } from './contracts';

/**
 * Provisional example façade treatments (until validated student type definitions, Phase 6).
 * Three deliberately contrasting types, per docs/DECISIONS.md "potential disagreement to test early".
 */
export const EXAMPLE_FACADES: Readonly<Record<string, FacadeSpec>> = Object.freeze({
  /** Large glazing. */
  gallery: Object.freeze({ windowFraction: 0.7 }),
  /** Smaller punched window. */
  studio: Object.freeze({ windowFraction: 0.25 }),
  /** Mostly solid, small vent-like opening. */
  storage: Object.freeze({ windowFraction: 0.04 }),
});

/** Used for any type without an example treatment. */
export const DEFAULT_FACADE: FacadeSpec = Object.freeze({ windowFraction: 0.15 });

export const exampleFacadeProvider: FacadeProvider = (functionId) =>
  Object.prototype.hasOwnProperty.call(EXAMPLE_FACADES, functionId) ? EXAMPLE_FACADES[functionId]! : DEFAULT_FACADE;

/** Clamp a window fraction into [0, 1]; non-finite values become 0 (closed wall). */
export const clampWindowFraction = (fraction: number): number =>
  Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
