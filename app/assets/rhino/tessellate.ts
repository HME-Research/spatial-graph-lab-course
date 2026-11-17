import earcut from 'earcut';

/**
 * Browser-side meshing for 3DM geometry that has NO render mesh saved in the file (2026-11-17,
 * owner: "surfaces must be read and rendered"). rhino3dm reads NURBS geometry exactly but has no
 * mesher (Rhino's tessellator is not in openNURBS), so this module meshes it itself, using only
 * rhino3dm evaluation calls:
 *
 *  - Brep faces (Rhino surfaces and polysurfaces; extrusions via `toBrep`): the face's trim loops
 *    are rebuilt from its 3D edge curves (`BrepFace.loops` → trims → `Brep.edges()`, sampled to a
 *    chord tolerance). A PLANAR face is triangulated in its plane (exact outline, holes included).
 *    A CURVED face's loops are mapped to the surface's (u, v) parameters (Gauss–Newton on
 *    `pointAt`), triangulated there, refined uniformly and evaluated back on the surface, so the
 *    result follows the curvature and the trims (openings) are kept.
 *  - Untrimmed surfaces (`Surface` objects): a (u, v) grid.
 *  - SubD: subdivided (Catmull–Clark, on a copy) and evaluated on the limit surface.
 *
 * Accuracy: a display approximation within `tolerance` (chord deviation, source units), not Rhino's
 * mesher; seams between faces can differ by up to about the tolerance. Polygon triangulation is
 * earcut (as in the owner's SpatialCore `geometry-core` `triangulatePolygon2D`, reused with
 * approval). Pure apart from the rhino3dm objects passed in; no React, Three.js or DOM.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- rhino3dm objects are handled structurally (see loader.ts). */

export interface Triangles {
  readonly positions: Float64Array;
  readonly indices: Uint32Array;
}

export interface TessellateOptions {
  /** Largest chord deviation from the true geometry, in source units. */
  readonly tolerance: number;
  /** Stop refining a face beyond this many triangles (the import's budget is checked later). */
  readonly maxTrianglesPerFace?: number;
}

type V3 = [number, number, number];
type V2 = [number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const dist = (a: V3, b: V3) => len(sub(a, b));
const pt = (p: number[]): V3 => [p[0]!, p[1]!, p[2]!];

function free(o: any): void {
  if (!o || typeof o !== 'object') return;
  let proto = Object.getPrototypeOf(o);
  while (proto && !Object.prototype.hasOwnProperty.call(proto, 'delete')) proto = Object.getPrototypeOf(proto);
  if (!proto || !Object.prototype.hasOwnProperty.call(proto, 'isDeleted')) return;
  try {
    if (!o.isDeleted()) o.delete();
  } catch {
    /* already released */
  }
}

// ── Curves ──────────────────────────────────────────────────────────────────────────────────

/** Points along `curve` (start to end, both included) within `tol` chord deviation. */
export function sampleCurve(curve: any, tol: number): V3[] {
  const [t0, t1] = curve.domain as [number, number];
  const at = (t: number) => pt(curve.pointAt(t));
  if (typeof curve.isLinear === 'function' && safe(() => curve.isLinear(), false)) return [at(t0), at(t1)];
  const spans = Math.max(1, Math.min(64, Number(safe(() => curve.spanCount, 1)) || 1));
  // At least 4 samples per span: catches S-shapes whose midpoint lies on the chord.
  const n0 = Math.min(256, spans * 4);
  const out: V3[] = [at(t0)];
  const refine = (a: number, pa: V3, b: number, pb: V3, depth: number) => {
    const m = (a + b) / 2;
    const pm = at(m);
    if (depth < 10 && dist(pm, mid(pa, pb)) > tol) {
      refine(a, pa, m, pm, depth + 1);
      refine(m, pm, b, pb, depth + 1);
    } else out.push(pb);
  };
  let prevT = t0;
  let prevP = out[0]!;
  for (let i = 1; i <= n0; i++) {
    const t = t0 + ((t1 - t0) * i) / n0;
    const p = at(t);
    refine(prevT, prevP, t, p, 0);
    prevT = t;
    prevP = p;
  }
  // Drop straight-run interior points (a linear span sampled 4× needs only its ends).
  return simplifyCollinear(out, tol * 0.05);
}

function simplifyCollinear(points: V3[], tol: number): V3[] {
  if (points.length <= 2) return points;
  const out: V3[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1]!;
    const b = points[i]!;
    const c = points[i + 1]!;
    const ac = sub(c, a);
    const l = len(ac);
    const d = l === 0 ? dist(a, b) : len(cross(sub(b, a), ac)) / l;
    if (d > tol) out.push(b);
  }
  out.push(points[points.length - 1]!);
  return out;
}

function safe<T>(f: () => T, fallback: T): T {
  try {
    return f();
  } catch {
    return fallback;
  }
}

// ── Brep faces ──────────────────────────────────────────────────────────────────────────────

/** The face's loops as closed 3D polylines (open form: no repeated closing point). */
function faceLoops(brep: any, face: any, tol: number, edgeCache: EdgeCache): V3[][] {
  const loops: V3[][] = [];
  const loopList = face.loops;
  const edges = brep.edges();
  for (let i = 0; i < loopList.count; i++) {
    const loop = loopList.get(i);
    const trims = loop.trims;
    const ring: V3[] = [];
    for (let k = 0; k < trims.count; k++) {
      const trim = trims.get(k);
      const edgeIndex: number = trim.edgeIndex;
      const reversed: boolean = trim.isReversed;
      free(trim);
      if (edgeIndex < 0) continue; // singular trim (a pole): no edge
      const key = `${tol}:${edgeIndex}`;
      let samples = edgeCache.get(key);
      if (!samples) {
        const edge = edges.get(edgeIndex);
        samples = sampleCurve(edge, tol);
        free(edge);
        edgeCache.set(key, samples);
      }
      const seq = reversed ? [...samples].reverse() : samples;
      for (const p of seq) if (ring.length === 0 || dist(ring[ring.length - 1]!, p) > tol * 1e-3) ring.push(p);
    }
    free(trims);
    free(loop);
    if (ring.length > 1 && dist(ring[0]!, ring[ring.length - 1]!) <= tol * 1e-3) ring.pop();
    if (ring.length >= 3) loops.push(ring);
  }
  free(loopList);
  free(edges);
  return loops;
}

function newell(points: readonly V3[]): V3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0, n = points.length; i < n; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % n]!;
    x += (p[1] - q[1]) * (p[2] + q[2]);
    y += (p[2] - q[2]) * (p[0] + q[0]);
    z += (p[0] - q[0]) * (p[1] + q[1]);
  }
  return [x, y, z];
}

const area2 = (r: readonly V2[]) => {
  let a = 0;
  for (let i = 0, n = r.length; i < n; i++) a += r[i]![0] * r[(i + 1) % n]![1] - r[(i + 1) % n]![0] * r[i]![1];
  return a / 2;
};

/**
 * Earcut over rings (largest |area| first = outer, others holes). Returns triangle indices into the
 * concatenated rings and whether the triangles cover exactly the outline minus the holes: a ring
 * that crosses itself or another ring (edges sampled too coarsely on a thin face) fails that check.
 */
function triangulateRings(rings2: readonly V2[][]): { order: number[]; indices: number[]; faithful: boolean } {
  const areas = rings2.map((r) => Math.abs(area2(r)));
  const outer = areas.indexOf(Math.max(...areas));
  const order = [outer, ...rings2.map((_, i) => i).filter((i) => i !== outer)];
  const flat: number[] = [];
  const holes: number[] = [];
  order.forEach((ri, k) => {
    if (k > 0) holes.push(flat.length / 2);
    for (const p of rings2[ri]!) flat.push(p[0], p[1]);
  });
  const indices = earcut(flat, holes, 2);
  const expected = areas[outer]! - areas.reduce((s, a, i) => (i === outer ? s : s + a), 0);
  let covered = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t]! * 2, indices[t + 1]! * 2, indices[t + 2]! * 2];
    covered += Math.abs((flat[b]! - flat[a]!) * (flat[c + 1]! - flat[a + 1]!) - (flat[c]! - flat[a]!) * (flat[b + 1]! - flat[a + 1]!)) / 2;
  }
  const faithful = expected > 0 && indices.length > 0 && Math.abs(covered - expected) <= expected * 1e-3;
  return { order, indices, faithful };
}

/** The face's outward normal at (u, v): the surface normal, flipped for a reversed face. */
function faceNormal(face: any, u: number, v: number): V3 {
  const n = pt(face.normalAt(u, v));
  return face.orientationIsReversed ? [-n[0], -n[1], -n[2]] : n;
}

/** A planar face in its plane; `null` when the outline is not flat within `tol` (rhino3dm's `isPlanar` is loose) or crosses itself. */
function planarFace(face: any, loops: V3[][], tol: number): Triangles | null {
  const outerGuess = loops.reduce((a, b) => (len(newell(b)) > len(newell(a)) ? b : a));
  let n = newell(outerGuess);
  const l = len(n);
  if (l < 1e-12) return null;
  n = [n[0] / l, n[1] / l, n[2] / l];
  const ref: V3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const xd = sub(ref, [n[0] * dot(ref, n), n[1] * dot(ref, n), n[2] * dot(ref, n)]);
  const xl = len(xd);
  const x: V3 = [xd[0] / xl, xd[1] / xl, xd[2] / xl];
  const y = cross(n, x);
  const o = outerGuess[0]!;
  for (const r of loops) for (const p of r) if (Math.abs(dot(sub(p, o), n)) > tol) return null;
  const rings2 = loops.map((r) => r.map((p): V2 => [dot(sub(p, o), x), dot(sub(p, o), y)]));
  const { order, indices, faithful } = triangulateRings(rings2);
  if (!faithful) return null;
  const positions: number[] = [];
  for (const ri of order) for (const p of loops[ri]!) positions.push(p[0], p[1], p[2]);
  const [u0, u1] = face.domain(0) as V2;
  const [v0, v1] = face.domain(1) as V2;
  const want = faceNormal(face, (u0 + u1) / 2, (v0 + v1) / 2);
  return orient(Float64Array.from(positions), indices, want);
}

/** Flip every triangle when the first non-degenerate one faces away from `want`. */
function orient(positions: Float64Array, indices: number[], want: V3): Triangles {
  const P = (i: number): V3 => [positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!];
  for (let t = 0; t < indices.length; t += 3) {
    const n = cross(sub(P(indices[t + 1]!), P(indices[t]!)), sub(P(indices[t + 2]!), P(indices[t]!)));
    if (len(n) < 1e-18) continue;
    if (dot(n, want) < 0) for (let k = 0; k < indices.length; k += 3) [indices[k + 1], indices[k + 2]] = [indices[k + 2]!, indices[k + 1]!];
    break;
  }
  return { positions, indices: Uint32Array.from(indices) };
}

interface SurfaceEval {
  readonly at: (u: number, v: number) => V3;
  readonly u: V2;
  readonly v: V2;
  readonly closedU: boolean;
  readonly closedV: boolean;
}

function surfaceEval(surface: any): SurfaceEval {
  return {
    at: (u, v) => pt(surface.pointAt(u, v)),
    u: surface.domain(0) as V2,
    v: surface.domain(1) as V2,
    closedU: !!safe(() => surface.isClosed(0), false),
    closedV: !!safe(() => surface.isClosed(1), false),
  };
}

const clamp = (x: number, [a, b]: V2) => Math.min(b, Math.max(a, x));

/** (u, v) of the surface point closest to `p` (Gauss–Newton from `seed`). */
function invert(s: SurfaceEval, p: V3, seed: V2): V2 {
  let [u, v] = seed;
  const hu = (s.u[1] - s.u[0]) * 1e-6;
  const hv = (s.v[1] - s.v[0]) * 1e-6;
  for (let it = 0; it < 30; it++) {
    const S = s.at(u, v);
    const r = sub(S, p);
    const uf = u + hu <= s.u[1] ? hu : -hu;
    const vf = v + hv <= s.v[1] ? hv : -hv;
    const Su = sub(s.at(u + uf, v), S).map((c) => c / uf) as V3;
    const Sv = sub(s.at(u, v + vf), S).map((c) => c / vf) as V3;
    const a = dot(Su, Su);
    const b = dot(Su, Sv);
    const c = dot(Sv, Sv);
    const det = a * c - b * b;
    if (Math.abs(det) < 1e-30) break;
    const gu = dot(Su, r);
    const gv = dot(Sv, r);
    const du = -(c * gu - b * gv) / det;
    const dv = -(a * gv - b * gu) / det;
    u = clamp(u + du, s.u);
    v = clamp(v + dv, s.v);
    if (Math.abs(du) < hu * 1e-3 && Math.abs(dv) < hv * 1e-3) break;
  }
  return [u, v];
}

/** Best start for `invert`: the closest point of a coarse (u, v) grid. */
function gridSeed(s: SurfaceEval, p: V3, n = 12): V2 {
  let best: V2 = [s.u[0], s.v[0]];
  let bestD = Infinity;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const u = s.u[0] + ((s.u[1] - s.u[0]) * i) / n;
      const v = s.v[0] + ((s.v[1] - s.v[0]) * j) / n;
      const d = dist(s.at(u, v), p);
      if (d < bestD) {
        bestD = d;
        best = [u, v];
      }
    }
  }
  return best;
}

/**
 * Map a 3D loop to (u, v), keeping it continuous across the seam of a closed surface. Each point
 * starts from the previous one; when that lands off the surface (a local minimum), it restarts
 * from the closest point of a fine grid. `null` when a point is not on the surface at all.
 */
function loopToUv(s: SurfaceEval, ring: readonly V3[], tol: number): V2[] | null {
  const out: V2[] = [];
  const pu = s.u[1] - s.u[0];
  const pv = s.v[1] - s.v[0];
  let seed = gridSeed(s, ring[0]!);
  for (const p of ring) {
    let [u, v] = invert(s, p, seed);
    if (dist(s.at(u, v), p) > tol) {
      [u, v] = invert(s, p, gridSeed(s, p, 48));
      if (dist(s.at(u, v), p) > tol * 4) return null;
    }
    const prev = out[out.length - 1];
    if (prev) {
      // Unwrap: on a closed surface pick the copy of (u, v) nearest the previous point.
      if (s.closedU) u += Math.round((prev[0] - u) / pu) * pu;
      if (s.closedV) v += Math.round((prev[1] - v) / pv) * pv;
    }
    out.push([u, v]);
    seed = [clamp(u, s.u), clamp(v, s.v)];
  }
  return out;
}

/**
 * Triangles of a (u, v) region (rings, the largest is the outline) on a surface: earcut in (u, v),
 * each triangle split into k × k, evaluated on the surface; k from the measured chord deviation.
 */
function meshUvRegion(s: SurfaceEval, rings: readonly V2[][], tol: number, maxTriangles: number, want: (u: number, v: number) => V3): Triangles | null {
  const { order, indices, faithful } = triangulateRings(rings as V2[][]);
  if (!faithful) return null;
  const uv: V2[] = order.flatMap((ri) => rings[ri]!);
  const wrapU = (u: number) => (s.closedU ? s.u[0] + ((((u - s.u[0]) % (s.u[1] - s.u[0])) + (s.u[1] - s.u[0])) % (s.u[1] - s.u[0])) : u);
  const wrapV = (v: number) => (s.closedV ? s.v[0] + ((((v - s.v[0]) % (s.v[1] - s.v[0])) + (s.v[1] - s.v[0])) % (s.v[1] - s.v[0])) : v);
  const at = (u: number, v: number) => s.at(clamp(wrapU(u), s.u), clamp(wrapV(v), s.v));

  // Deviation of each triangle's edge midpoints and centroid from the flat triangle.
  let maxDev = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = uv[indices[t]!]!;
    const b = uv[indices[t + 1]!]!;
    const c = uv[indices[t + 2]!]!;
    const A = at(a[0], a[1]);
    const B = at(b[0], b[1]);
    const C = at(c[0], c[1]);
    const m = (p: V2, q: V2): V2 => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    for (const [p, q, P, Q] of [
      [a, b, A, B],
      [b, c, B, C],
      [c, a, C, A],
    ] as const) {
      const mm = m(p, q);
      maxDev = Math.max(maxDev, dist(at(mm[0], mm[1]), mid(P, Q)));
    }
    const g: V2 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
    const G: V3 = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
    maxDev = Math.max(maxDev, dist(at(g[0], g[1]), G));
  }
  // Chord deviation falls with the square of the subdivision; never fewer than 2 on a curved face.
  const triangles = indices.length / 3;
  const kMax = Math.max(1, Math.floor(Math.sqrt(maxTriangles / triangles)));
  const k = Math.min(kMax, Math.max(2, Math.ceil(Math.sqrt(maxDev / tol) * 1.5)));

  const positions: number[] = [];
  const out: number[] = [];
  const cache = new Map<string, number>();
  const vertex = (u: number, v: number) => {
    const key = `${u.toPrecision(12)},${v.toPrecision(12)}`;
    let i = cache.get(key);
    if (i === undefined) {
      const p = at(u, v);
      i = positions.length / 3;
      positions.push(p[0], p[1], p[2]);
      cache.set(key, i);
    }
    return i;
  };
  for (let t = 0; t < indices.length; t += 3) {
    const a = uv[indices[t]!]!;
    const b = uv[indices[t + 1]!]!;
    const c = uv[indices[t + 2]!]!;
    // Barycentric grid: point (i, j) = a + (b − a)·i/k + (c − a)·j/k, i + j ≤ k.
    const P = (i: number, j: number) => vertex(a[0] + ((b[0] - a[0]) * i + (c[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * i + (c[1] - a[1]) * j) / k);
    for (let j = 0; j < k; j++) {
      for (let i = 0; i < k - j; i++) {
        out.push(P(i, j), P(i + 1, j), P(i, j + 1));
        if (i + j + 1 < k) out.push(P(i + 1, j), P(i + 1, j + 1), P(i, j + 1));
      }
    }
  }
  const first = uv[indices[0]!]!;
  return orient(Float64Array.from(positions), out, want(clamp(wrapU(first[0]), s.u), clamp(wrapV(first[1]), s.v)));
}

/** Edge samples shared by the faces of one Brep, per tolerance (`${tolerance}:${edgeIndex}`). */
export type EdgeCache = Map<string, V3[]>;

/**
 * Mesh one Brep face without a render mesh. `null` when it cannot be meshed (reported by the
 * caller). When the outline sampled at `tolerance` crosses itself (a face thinner than the
 * tolerance, e.g. a 1 cm ribbon on a 7 m stair), the face is resampled 4×, 16× and 64× finer.
 */
export function tessellateBrepFace(brep: any, face: any, options: TessellateOptions, edgeCache: EdgeCache = new Map()): Triangles | null {
  const maxTriangles = options.maxTrianglesPerFace ?? 20000;
  try {
    const planar = !!safe(() => face.isPlanar(), false);
    for (const factor of [1, 4, 16, 64]) {
      const tol = options.tolerance / factor;
      const loops = faceLoops(brep, face, tol, edgeCache);
      if (loops.length === 0) return untrimmed(face, tol, maxTriangles, (u, v) => faceNormal(face, u, v));
      if (planar) {
        const flat = planarFace(face, loops, tol);
        if (flat) return flat;
      }
      const s = surfaceEval(face);
      // An untrimmed face (its one loop is the surface's own boundary): a (u, v) grid, no inversion.
      if (factor === 1 && isNaturalBoundary(s, loops, tol)) return untrimmed(face, tol, maxTriangles, (u, v) => faceNormal(face, u, v));
      const rings = loops.map((r) => loopToUv(s, r, tol));
      if (rings.some((r) => r === null)) continue;
      const curved = meshUvRegion(s, rings as V2[][], tol, maxTriangles, (u, v) => faceNormal(face, u, v));
      if (curved) return curved;
    }
    return null;
  } catch {
    return null;
  }
}

/** Distance from `p` to a closed polyline. */
function distToRing(p: V3, ring: readonly V3[]): number {
  let best = Infinity;
  for (let i = 0, n = ring.length; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    const ab = sub(b, a);
    const l2 = dot(ab, ab);
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
    best = Math.min(best, dist(p, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]));
  }
  return best;
}

/** True when the face has one loop and it runs along all four sides of the surface's domain. */
function isNaturalBoundary(s: SurfaceEval, loops: readonly V3[][], tol: number): boolean {
  if (loops.length !== 1) return false;
  const ring = loops[0]!;
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const u = s.u[0] + ((s.u[1] - s.u[0]) * i) / n;
    const v = s.v[0] + ((s.v[1] - s.v[0]) * i) / n;
    for (const p of [s.at(u, s.v[0]), s.at(u, s.v[1]), s.at(s.u[0], v), s.at(s.u[1], v)]) if (distToRing(p, ring) > tol * 2) return false;
  }
  return true;
}

/**
 * A whole (untrimmed) surface as a (u, v) grid. The grid density per direction comes from second
 * differences on a 16 × 16 sample (chord deviation ≈ |S''|·h²/8), so flat directions stay coarse.
 */
function untrimmed(surface: any, tol: number, maxTriangles: number, want: (u: number, v: number) => V3): Triangles | null {
  const s = surfaceEval(surface);
  const N = 16;
  const U = (i: number, n: number) => s.u[0] + ((s.u[1] - s.u[0]) * i) / n;
  const Vv = (j: number, n: number) => s.v[0] + ((s.v[1] - s.v[0]) * j) / n;
  const sample: V3[][] = [];
  for (let i = 0; i <= N; i++) {
    const row: V3[] = [];
    for (let j = 0; j <= N; j++) row.push(s.at(U(i, N), Vv(j, N)));
    sample.push(row);
  }
  let du = 0;
  let dv = 0;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const p = sample[i]![j]!;
      if (i > 0 && i < N) du = Math.max(du, len(sub(sub(sample[i - 1]![j]!, p), sub(p, sample[i + 1]![j]!))) / 8);
      if (j > 0 && j < N) dv = Math.max(dv, len(sub(sub(sample[i]![j - 1]!, p), sub(p, sample[i]![j + 1]!))) / 8);
    }
  }
  let nu = Math.max(1, Math.min(128, Math.ceil(N * Math.sqrt(du / tol))));
  let nv = Math.max(1, Math.min(128, Math.ceil(N * Math.sqrt(dv / tol))));
  while (nu * nv * 2 > maxTriangles && (nu > 1 || nv > 1)) {
    if (nu >= nv) nu = Math.max(1, Math.floor(nu * 0.8));
    else nv = Math.max(1, Math.floor(nv * 0.8));
  }
  const positions: number[] = [];
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      const p = s.at(U(i, nu), Vv(j, nv));
      positions.push(p[0], p[1], p[2]);
    }
  }
  const id = (i: number, j: number) => i * (nv + 1) + j;
  const indices: number[] = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) indices.push(id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j), id(i + 1, j + 1), id(i, j + 1));
  }
  // Orientation from a triangle away from a possible pole.
  return orient(Float64Array.from(positions), indices, want(U(nu > 1 ? 1 : 0, nu), Vv(nv > 1 ? 1 : 0, nv)));
}

/** Mesh an untrimmed `Surface` object (NURBS, plane, revolution, sum surface). */
export function tessellateSurface(surface: any, options: TessellateOptions): Triangles | null {
  try {
    return untrimmed(surface, options.tolerance, options.maxTrianglesPerFace ?? 20000, (u, v) => pt(surface.normalAt(u, v)));
  } catch {
    return null;
  }
}

// ── SubD ────────────────────────────────────────────────────────────────────────────────────

/** A polygon mesh: shared vertices, faces as vertex-index rings (quads, triangles, n-gons). */
interface PolyMesh {
  readonly vertices: V3[];
  readonly faces: number[][];
}

/**
 * One Catmull–Clark step (every face becomes quads), with the standard boundary rules (boundary
 * edge points are midpoints; boundary vertices use 1/8 · 3/4 · 1/8). Crease and sharp-edge tags of
 * the SubD are not available through rhino3dm, so they are smoothed like every other edge.
 */
export function catmullClark(mesh: PolyMesh): PolyMesh {
  const { vertices, faces } = mesh;
  const facePoints = faces.map((f) => {
    const c: V3 = [0, 0, 0];
    for (const i of f) for (let k = 0; k < 3; k++) c[k] = c[k]! + vertices[i]![k]! / f.length;
    return c;
  });
  const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  const edges = new Map<string, { a: number; b: number; faces: number[]; point: number }>();
  faces.forEach((f, fi) => {
    for (let k = 0; k < f.length; k++) {
      const a = f[k]!;
      const b = f[(k + 1) % f.length]!;
      const e = edges.get(key(a, b));
      if (e) e.faces.push(fi);
      else edges.set(key(a, b), { a, b, faces: [fi], point: -1 });
    }
  });
  const out: V3[] = [];
  // New positions of the original vertices.
  const faceSum = vertices.map((): V3 => [0, 0, 0]);
  const faceCount = vertices.map(() => 0);
  faces.forEach((f, fi) => {
    for (const i of f) {
      for (let k = 0; k < 3; k++) faceSum[i]![k] = faceSum[i]![k]! + facePoints[fi]![k]!;
      faceCount[i]!++;
    }
  });
  const midSum = vertices.map((): V3 => [0, 0, 0]);
  const valence = vertices.map(() => 0);
  const boundary = vertices.map((): number[] => []);
  for (const e of edges.values()) {
    const m = mid(vertices[e.a]!, vertices[e.b]!);
    for (const i of [e.a, e.b]) {
      for (let k = 0; k < 3; k++) midSum[i]![k] = midSum[i]![k]! + m[k]!;
      valence[i]!++;
    }
    if (e.faces.length === 1) {
      boundary[e.a]!.push(e.b);
      boundary[e.b]!.push(e.a);
    }
  }
  vertices.forEach((v, i) => {
    if (boundary[i]!.length >= 2) {
      const [p, q] = [vertices[boundary[i]![0]!]!, vertices[boundary[i]![1]!]!];
      out.push([0.75 * v[0] + 0.125 * (p[0] + q[0]), 0.75 * v[1] + 0.125 * (p[1] + q[1]), 0.75 * v[2] + 0.125 * (p[2] + q[2])]);
    } else if (faceCount[i]! === 0 || boundary[i]!.length === 1) {
      out.push([...v]);
    } else {
      const n = faceCount[i]!;
      const F = faceSum[i]!.map((c) => c / n) as V3;
      const R = midSum[i]!.map((c) => c / valence[i]!) as V3;
      out.push([(F[0] + 2 * R[0] + (n - 3) * v[0]) / n, (F[1] + 2 * R[1] + (n - 3) * v[1]) / n, (F[2] + 2 * R[2] + (n - 3) * v[2]) / n]);
    }
  });
  const fpIndex = facePoints.map((p) => out.push(p) - 1);
  for (const e of edges.values()) {
    const m = mid(vertices[e.a]!, vertices[e.b]!);
    if (e.faces.length === 2) {
      const [f1, f2] = [facePoints[e.faces[0]!]!, facePoints[e.faces[1]!]!];
      e.point = out.push([(2 * m[0] + f1[0] + f2[0]) / 4, (2 * m[1] + f1[1] + f2[1]) / 4, (2 * m[2] + f1[2] + f2[2]) / 4]) - 1;
    } else e.point = out.push(m) - 1;
  }
  const newFaces: number[][] = [];
  faces.forEach((f, fi) => {
    for (let k = 0; k < f.length; k++) {
      const prev = f[(k + f.length - 1) % f.length]!;
      const v = f[k]!;
      const next = f[(k + 1) % f.length]!;
      newFaces.push([v, edges.get(key(v, next))!.point, fpIndex[fi]!, edges.get(key(prev, v))!.point]);
    }
  });
  return { vertices: out, faces: newFaces };
}

/**
 * Mesh a SubD: its control net (`Mesh.createFromSubDControlNet`) smoothed by Catmull–Clark in
 * JavaScript, as many levels (up to `levels`, default 3) as fit in `maxTriangles`. rhino3dm 8.35's
 * own SubD subdivision and limit-point calls do not work (subdivide() returns false; face
 * vertices are not readable), so the control net is the only reliable input.
 */
export function tessellateSubD(rhino: any, subd: any, options: { readonly maxTriangles: number; readonly levels?: number }): Triangles | null {
  let net: any = null;
  try {
    net = rhino.Mesh.createFromSubDControlNet(subd, false);
    if (!net) return null;
    const vs = net.vertices();
    const fs = net.faces();
    const vertices: V3[] = [];
    for (let i = 0; i < vs.count; i++) vertices.push(pt(vs.get(i)));
    const faces: number[][] = [];
    for (let i = 0; i < fs.count; i++) {
      const [a, b, c, d] = fs.get(i) as number[];
      faces.push(c === d ? [a!, b!, c!] : [a!, b!, c!, d!]);
    }
    free(vs);
    free(fs);
    if (faces.length === 0) return null;
    let mesh: PolyMesh = { vertices, faces };
    const polygons = faces.reduce((s, f) => s + f.length, 0); // quads after the first level
    let levels = options.levels ?? 3;
    while (levels > 0 && polygons * 4 ** (levels - 1) * 2 > options.maxTriangles) levels--;
    for (let i = 0; i < levels; i++) mesh = catmullClark(mesh);
    const positions = new Float64Array(mesh.vertices.length * 3);
    mesh.vertices.forEach((p, i) => positions.set(p, i * 3));
    const indices: number[] = [];
    for (const f of mesh.faces) for (let k = 1; k + 1 < f.length; k++) indices.push(f[0]!, f[k]!, f[k + 1]!);
    return { positions, indices: Uint32Array.from(indices) };
  } catch {
    return null;
  } finally {
    free(net);
  }
}
