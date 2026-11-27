/**
 * Shared sizing rules of the Tiny homes toolkit, used by "Space efficiency" and by
 * "Tiny home iterations", so both rate a room in the same way.
 */

/** A room is "efficient" up to this many times its minimum area; above it, "oversized". */
export const EFFICIENT_MAX_RATIO = 1.5;

/** The tiny-home range this toolkit is about (m²). */
export const SMALLEST_HOME = 9;
export const LARGEST_HOME = 37;

/** How a room's area compares with what it needs. */
export type SizeRating = 'undersized' | 'efficient' | 'oversized';

/** Rate a room: smaller than its minimum, up to 1.5 × its minimum, or larger. */
export function rateSize(area: number, minArea: number): SizeRating {
  if (area < minArea) return 'undersized';
  if (area <= minArea * EFFICIENT_MAX_RATIO) return 'efficient';
  return 'oversized';
}

/** A number of m² with at most one decimal, e.g. 4.5 or 9. */
export function formatArea(m2: number): string {
  const rounded = Math.round(m2 * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
