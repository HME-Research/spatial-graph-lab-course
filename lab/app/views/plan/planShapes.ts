import type { PlanOpening, PlanRect } from '@app/building';

/**
 * Drawing conventions of the Plan (pure; SVG path strings in plan metres). They only decorate
 * what `buildPlan` produced: positions and widths always come from the FaceLayout openings.
 */

type Pt = readonly [number, number];

/** Map (along-wall, across-wall) to plan (x, y) for an opening. */
function frameOf(o: Pick<PlanOpening, 'rect' | 'along'>) {
  const r = o.rect;
  const alongX = o.along === 'x';
  const a0 = alongX ? r.x0 : r.y0;
  const a1 = alongX ? r.x1 : r.y1;
  const c0 = alongX ? r.y0 : r.x0;
  const c1 = alongX ? r.y1 : r.x1;
  const pt = (a: number, c: number): Pt => (alongX ? [a, c] : [c, a]);
  return { a0, a1, c0, c1, pt };
}

const fmt = (n: number) => String(Math.round(n * 1e4) / 1e4);
const p = (q: Pt) => `${fmt(q[0])} ${fmt(q[1])}`;

/**
 * Door leaf and quarter-circle swing, hinged at the opening's start jamb. Returns SVG path data.
 * The door swings into its edge's TARGET (2026-11-24): the owner room's side (opposite the face's
 * outward normal), or the neighbour's side when `intoNeighbour` is set. Reversing the edge
 * reverses the swing.
 */
export function doorSwingPath(o: Pick<PlanOpening, 'rect' | 'along' | 'normal' | 'width' | 'intoNeighbour'>): string {
  const { a0, a1, c0, c1, pt } = frameOf(o);
  const n = o.along === 'x' ? o.normal[1] : o.normal[0];
  // Inner face of the wall on the side the door swings into, and the direction into that room.
  const towardNormal = n > 0 ? 1 : -1;
  const inward = o.intoNeighbour ? towardNormal : -towardNormal;
  const c = inward < 0 ? c0 : c1;
  const hinge = pt(a0, c);
  const leafEnd = pt(a0, c + inward * o.width);
  const jamb = pt(a1, c);
  const v1 = [leafEnd[0] - hinge[0], leafEnd[1] - hinge[1]];
  const v2 = [jamb[0] - hinge[0], jamb[1] - hinge[1]];
  const sweep = v1[0]! * v2[1]! - v1[1]! * v2[0]! > 0 ? 1 : 0;
  const r = fmt(o.width);
  return `M ${p(hinge)} L ${p(leafEnd)} A ${r} ${r} 0 0 ${sweep} ${p(jamb)}`;
}

/** Window in plan: the two wall faces plus the glass line in the middle. */
export function windowPath(o: Pick<PlanOpening, 'rect' | 'along'>): string {
  const { a0, a1, c0, c1, pt } = frameOf(o);
  const m = (c0 + c1) / 2;
  return [c0, m, c1].map((c) => `M ${p(pt(a0, c))} L ${p(pt(a1, c))}`).join(' ');
}

/** Wall-centre line across an opening (used for `open`: "no wall here"). */
export function centreLinePath(o: Pick<PlanOpening, 'rect' | 'along'>): string {
  const { a0, a1, c0, c1, pt } = frameOf(o);
  const m = (c0 + c1) / 2;
  return `M ${p(pt(a0, m))} L ${p(pt(a1, m))}`;
}

/** Rectangle with both diagonals: the drafting sign for a void in the floor. */
export function crossedRectPath(r: PlanRect): string {
  return `M ${p([r.x0, r.y0])} L ${p([r.x1, r.y1])} M ${p([r.x1, r.y0])} L ${p([r.x0, r.y1])}`;
}

/** Expand a rectangle by `d` on every side (hit areas). */
export const grow = (r: PlanRect, d: number): PlanRect => ({ x0: r.x0 - d, x1: r.x1 + d, y0: r.y0 - d, y1: r.y1 + d });
