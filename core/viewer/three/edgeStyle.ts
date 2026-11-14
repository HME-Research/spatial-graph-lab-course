import { EDGE_KINDS, isVerticalKind, type EdgeKind } from '../../graph';

/**
 * Visual encoding of edge kinds in the 3D views (pure).
 * Colour family separates horizontal (blue-grey) from vertical (orange) relationships;
 * the dash pattern separates the two kinds within each family. A 3D edge is drawn between
 * cell centres as a relationship marker, never as a staircase or corridor.
 */
export interface EdgeStyle {
  readonly label: string;
  readonly color: string;
  readonly dashed: boolean;
  /** Tube radius in metres. */
  readonly radius: number;
}

export const HORIZONTAL_EDGE_COLOR = '#2f5878';
export const VERTICAL_EDGE_COLOR = '#d0621b';

export const EDGE_STYLES: Readonly<Record<EdgeKind, EdgeStyle>> = {
  door: { label: 'door (horizontal)', color: HORIZONTAL_EDGE_COLOR, dashed: false, radius: 0.07 },
  open: { label: 'open (horizontal)', color: HORIZONTAL_EDGE_COLOR, dashed: true, radius: 0.07 },
  'vertical-access': { label: 'vertical access (vertical)', color: VERTICAL_EDGE_COLOR, dashed: false, radius: 0.09 },
  atrium: { label: 'atrium (vertical)', color: VERTICAL_EDGE_COLOR, dashed: true, radius: 0.09 },
};

/** Legend order: horizontal kinds first, then vertical. */
export const EDGE_LEGEND_ORDER: readonly EdgeKind[] = [
  ...EDGE_KINDS.filter((k) => !isVerticalKind(k)),
  ...EDGE_KINDS.filter((k) => isVerticalKind(k)),
];

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
