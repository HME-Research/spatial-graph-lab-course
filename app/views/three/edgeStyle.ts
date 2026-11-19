/**
 * Line helpers for relationships in the 3D views (pure). Relationship lines are styled by the
 * shared presentation (`relationshipLine`); a 3D edge is a relationship marker, never a staircase
 * or corridor.
 */

/** Same-storey (horizontal) and between-storeys (vertical) relationship colours. */
export const HORIZONTAL_EDGE_COLOR = '#2f5878';
export const VERTICAL_EDGE_COLOR = '#d0621b';

/**
 * Dash intervals `[from, to]` (distances from the start) covering `[0, length]`, symmetric about
 * the middle so both endpoints look alike. Returns one full interval when not dashed or too short.
 */
export function dashIntervals(length: number, dashed: boolean, dash = 0.32, gap = 0.22): [number, number][] {
  if (length <= 0) return [];
  if (!dashed || length < dash * 2 + gap) return [[0, length]];
  const period = dash + gap;
  const count = Math.max(1, Math.floor((length + gap) / period));
  const used = count * dash + (count - 1) * gap;
  const offset = (length - used) / 2;
  const out: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const from = offset + i * period;
    out.push([from, from + dash]);
  }
  return out;
}
