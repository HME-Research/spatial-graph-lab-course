import { describe, expect, it } from 'vitest';
import { DEFAULT_CELL_SIZE } from '@core/viewer/coordinates';
import type { FaceDirection, ResolvedFace } from '@app/building/contracts';
import { DEFAULT_WALL_THICKNESS, layoutFace, type FaceFrame, type Vec3 } from '@app/building/faceLayout';
import { directionOrientation } from '@app/building/resolve';
import { groupWallRuns } from '@app/building/wallRuns';
import {
  applyPlacement,
  distortionDiagnostics,
  normaliseFacadeSource,
  repeatPlacements,
  stretchPlacement,
  targetFromFaceFrame,
  targetFromWallRun,
  unitFromRhinoName,
  wallRotationDegrees,
  type FacadeComponent,
  type FacadeSource,
  type SourceMesh,
} from './facadeAdapter';

// ---- synthetic sources: the same shapes as the scratch-harness .3dm samples (F1, F2, F5) ----

/** Axis-aligned box mesh with outward-facing (counter-clockwise from outside) triangles. */
function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): SourceMesh {
  const v = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1];
  const quads = [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ];
  const indices = quads.flatMap(([a, b, c, d]) => [a!, b!, c!, a!, c!, d!]);
  return { positions: new Float64Array(v), indices: new Uint32Array(indices) };
}

/** F1/F2: 3 m bay with a window opening; `s` units per metre, drawn at offset (ox, oy, oz). */
function windowPanel(s: number, ox = 0, oy = 0, oz = 0): SourceMesh[] {
  const W = 3 * s, H = 3 * s, D = 0.2 * s;
  const wx0 = 0.6 * s, wx1 = W - 0.6 * s, wz0 = 0.9 * s, wz1 = H - 0.4 * s;
  const B = (a: number, b: number, c: number, d: number, e: number, f: number) => box(ox + a, oy + b, oz + c, ox + d, oy + e, oz + f);
  return [B(0, 0, 0, wx0, D, H), B(wx1, 0, 0, W, D, H), B(wx0, 0, 0, wx1, D, wz0), B(wx0, 0, wz1, wx1, D, H), B(wx0, 0.08 * s, wz0, wx1, 0.1 * s, wz1)];
}

/** F5: 9 m curtain-wall run with four 100 mm mullions. */
function curtainRun9m(): SourceMesh[] {
  return [...[0, 2.95, 5.95, 8.9].map((x) => box(x, 0, 0, x + 0.1, 0.2, 3)), box(0, 0, 2.9, 9, 0.2, 3), box(0.1, 0.09, 0, 8.9, 0.11, 2.9)];
}

function component(source: FacadeSource): FacadeComponent {
  const result = normaliseFacadeSource(source);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.component;
}

function bounds(p: ArrayLike<number>) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i++) {
    min[i % 3] = Math.min(min[i % 3]!, p[i]!);
    max[i % 3] = Math.max(max[i % 3]!, p[i]!);
  }
  return { min, max };
}

const sub = (p: Vec3, q: Vec3): Vec3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const cross = (p: Vec3, q: Vec3): Vec3 => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
const vertex = (p: ArrayLike<number>, i: number): Vec3 => [p[3 * i]!, p[3 * i + 1]!, p[3 * i + 2]!];

/** Unit normal of triangle t from its winding. */
function triangleNormal(positions: ArrayLike<number>, indices: ArrayLike<number>, t: number): Vec3 {
  const a = vertex(positions, indices[3 * t]!);
  const n = cross(sub(vertex(positions, indices[3 * t + 1]!), a), sub(vertex(positions, indices[3 * t + 2]!), a));
  const l = Math.hypot(...n);
  return [n[0] / l + 0, n[1] / l + 0, n[2] / l + 0];
}

/** Rooms in these tests: r = 1, hall = 2. */
const exteriorWall = (owner: number, cell: [number, number, number], direction: FaceDirection): ResolvedFace => ({
  id: `${owner}:${cell.join(',')}:${direction}`,
  ownerNodeId: owner,
  ownerFunction: 'gallery',
  cell,
  direction,
  orientation: directionOrientation(direction),
  neighbourNodeId: null,
  edgeId: null,
  condition: 'exterior',
});

const W = DEFAULT_CELL_SIZE.horizontal;
const H = DEFAULT_CELL_SIZE.vertical;
const MOUNT = DEFAULT_WALL_THICKNESS / 2;

describe('normaliseFacadeSource: units, axes and bounding box', () => {
  it('maps Rhino unit names and never guesses an unknown one', () => {
    expect(unitFromRhinoName('Meters')).toBe('m');
    expect(unitFromRhinoName('Millimeters')).toBe('mm');
    expect(unitFromRhinoName('Feet')).toBe('ft');
    expect(unitFromRhinoName('None')).toBe('unitless');
    expect(unitFromRhinoName('Parsecs')).toBe('unsupported');
  });

  it('normalises a metre panel at the origin and a millimetre panel far from it to the same component', () => {
    const m = component({ unit: 'm', meshes: windowPanel(1) });
    const mm = component({ unit: 'mm', meshes: windowPanel(1000, 12000, -500, 3000) });
    for (const c of [m, mm]) {
      expect(c.width).toBeCloseTo(3, 9);
      expect(c.height).toBeCloseTo(3, 9);
      expect(c.depth).toBeCloseTo(0.2, 9);
      expect(bounds(c.positions).min).toEqual([0, 0, 0]);
    }
    expect(mm.metresPerUnit).toBe(0.001);
    expect(mm.sourceBounds).toEqual({ min: [12000, -500, 3000], max: [15000, -300, 6000] });
    for (let i = 0; i < m.positions.length; i++) expect(mm.positions[i]).toBeCloseTo(m.positions[i]!, 9);
  });

  it('maps source x → a (along), z → b (up) and −y → c (outward) through zUpToYUp', () => {
    // Glass sits at source y 0.08..0.10 of a 0.2 m deep panel facing −y: c = 0.2 − y = 0.10..0.12.
    const c = component({ unit: 'm', meshes: [windowPanel(1)[4]!, box(0, 0, 0, 3, 0.2, 3)] });
    const glass = bounds(c.positions.subarray(0, 24));
    expect(glass.min.map((x) => +x.toFixed(9))).toEqual([0.6, 0.9, 0.1]);
    expect(glass.max.map((x) => +x.toFixed(9))).toEqual([2.4, 2.6, 0.12]);
  });

  it('treats outward +y as a 180° rotation (never a mirror): outer faces keep pointing outward', () => {
    for (const outward of ['-y', '+y'] as const) {
      const c = component({ unit: 'm', meshes: [box(0, 0, 0, 3, 0.2, 3)], outward });
      // Triangles 4..5 are the source −y face, 8..9 the +y face (see `box`).
      const exteriorTriangle = outward === '-y' ? 4 : 8;
      expect(triangleNormal(c.positions, c.indices, exteriorTriangle)).toEqual([0, 0, 1]);
      expect(bounds(c.positions).min).toEqual([0, 0, 0]);
    }
    // A feature at source x = 0..0.6 is on the LEFT seen from −y, on the RIGHT seen from +y.
    const pier = (outward: '-y' | '+y') => bounds(component({ unit: 'm', meshes: [box(0, 0, 0, 0.6, 0.2, 3), box(0, 0, 0, 3, 0.2, 3)], outward }).positions.subarray(0, 24));
    expect(pier('-y').min[0]).toBeCloseTo(0, 9);
    expect(pier('+y').min[0]).toBeCloseTo(2.4, 9);
  });

  it('refuses unitless files unless the unit is chosen explicitly', () => {
    const refused = normaliseFacadeSource({ unit: 'unitless', meshes: windowPanel(1) });
    expect(refused.ok).toBe(false);
    expect(refused.diagnostics[0]!.code).toBe('units-unknown');
    const accepted = normaliseFacadeSource({ unit: 'unitless', meshes: windowPanel(1000) }, { assumeUnitlessAs: 'mm' });
    expect(accepted.ok && accepted.component.width).toBeCloseTo(3, 9);
    expect(accepted.diagnostics.map((d) => d.code)).toEqual(['units-assumed']);
  });

  it('refuses implausible sizes (a millimetre file declared as metres)', () => {
    const r = normaliseFacadeSource({ unit: 'm', meshes: windowPanel(1000) });
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0]!.code).toBe('implausible-size');
  });

  it('refuses invalid, empty, degenerate and over-budget geometry', () => {
    const code = (source: FacadeSource, budget?: number) => normaliseFacadeSource(source, budget === undefined ? {} : { maxTriangles: budget }).diagnostics[0]!.code;
    expect(code({ unit: 'm', meshes: [] })).toBe('no-geometry');
    expect(code({ unit: 'm', meshes: [{ positions: [0, 0], indices: [0, 0, 0] }] })).toBe('invalid-mesh');
    expect(code({ unit: 'm', meshes: [{ positions: [0, 0, NaN, 1, 0, 0, 0, 0, 1], indices: [0, 1, 2] }] })).toBe('invalid-mesh');
    expect(code({ unit: 'm', meshes: [{ positions: [0, 0, 0, 1, 0, 0, 0, 0, 1], indices: [0, 1, 3] }] })).toBe('invalid-mesh');
    expect(code({ unit: 'm', meshes: [{ positions: [0, 0, 0, 1, 0, 0, 0, 0, 1], indices: [0, 1] }] })).toBe('invalid-mesh');
    // A panel drawn flat in the XY plane (a floor, not a façade) has no height.
    expect(code({ unit: 'm', meshes: [{ positions: [0, 0, 0, 3, 0, 0, 3, 3, 0], indices: [0, 1, 2] }] })).toBe('degenerate-bounds');
    expect(code({ unit: 'm', meshes: windowPanel(1) }, 10)).toBe('too-many-triangles');
    // A whole building model (or a panel drawn with the wrong depth axis) is far deeper than a façade.
    expect(code({ unit: 'm', meshes: [box(0, 0, 0, 3, 3, 3)] })).toBe('too-deep');
  });
});

describe('placement onto FaceLayout frames', () => {
  const panel = component({ unit: 'm', meshes: windowPanel(1) });
  const frameOf = (direction: FaceDirection, cell: [number, number, number] = [0, 0, 0]) => layoutFace(exteriorWall(1, cell, direction)).frame;

  it('places one bay on a −y wall: back face just outside the wall centre plane, bay corners aligned', () => {
    const target = targetFromFaceFrame(frameOf('-y'));
    expect(target).toMatchObject({ origin: [0, 1.5, 1.5], right: [1, 0, 0], up: [0, 1, 0], normal: [0, 0, 1], width: W, height: H });
    const [placement] = repeatPlacements(panel, [frameOf('-y')]);
    const b = bounds(applyPlacement(panel, placement!));
    expect(b.min.map((x) => +x.toFixed(5))).toEqual([-1.5, 0, +(1.5 + MOUNT).toFixed(5)]);
    expect(b.max.map((x) => +x.toFixed(5))).toEqual([1.5, 3, +(1.5 + MOUNT + 0.2).toFixed(5)]);
  });

  it('rotates (never mirrors) the component for each wall normal; the exterior stays outward', () => {
    const expected: Record<string, { rot: number; right: Vec3 }> = {
      '-y': { rot: 0, right: [1, 0, 0] },
      '+x': { rot: 90, right: [0, 0, -1] },
      '+y': { rot: 180, right: [-1, 0, 0] },
      '-x': { rot: -90, right: [0, 0, 1] },
    };
    const outer = component({ unit: 'm', meshes: [box(0, 0, 0, 3, 0.2, 3)] }); // triangle 4 faces outward
    for (const direction of ['-y', '+x', '+y', '-x'] as const) {
      const frame = frameOf(direction);
      const target = targetFromFaceFrame(frame);
      expect(wallRotationDegrees(frame.normal)).toBeCloseTo(expected[direction]!.rot, 9);
      expect(target.right).toEqual(expected[direction]!.right);
      // Layout u equals `right` on −y/−x walls but points left on +x/+y walls.
      expect(frame.u.every((x, i) => x === target.right[i])).toBe(direction === '-y' || direction === '-x');
      const placement = repeatPlacements(outer, [frame])[0]!;
      const m = placement.matrix;
      const det = m[0]! * (m[5]! * m[10]! - m[6]! * m[9]!) - m[4]! * (m[1]! * m[10]! - m[2]! * m[9]!) + m[8]! * (m[1]! * m[6]! - m[2]! * m[5]!);
      expect(det).toBeGreaterThan(0);
      const placed = applyPlacement(outer, placement);
      triangleNormal(placed, outer.indices, 4).forEach((x, i) => expect(x).toBeCloseTo(frame.normal[i]!, 6));
      // The ±x frame width includes a wall thickness; the bay target does not.
      expect(frame.width).toBeCloseTo(direction.endsWith('x') ? W + DEFAULT_WALL_THICKNESS : W, 9);
      expect(target.width).toBe(W);
    }
  });

  it('refuses slab frames', () => {
    expect(() => targetFromFaceFrame(layoutFace({ ...exteriorWall(1, [0, 0, 0], '+z'), orientation: 'slab' }).frame)).toThrow(/wall faces only/);
  });
});

describe('Repeat unit bays vs Stretch wall run', () => {
  // A 3-bay room along grid x; its −y exterior faces form one wall run.
  const cells: [number, number, number][] = [[0, 0, 0], [1, 0, 0], [2, 0, 0]];
  const faces = cells.map((c) => exteriorWall(2, c, '-y'));
  const [run] = groupWallRuns(faces);
  const frameById = new Map(faces.map((f) => [f.id, layoutFace(f).frame]));
  const runFrames: FaceFrame[] = run!.faceIds.map((id) => frameById.get(id)!);
  const bay = component({ unit: 'm', meshes: windowPanel(1) });
  const curtain = component({ unit: 'm', meshes: curtainRun9m() });

  it('groups the faces into one 3-bay run and derives a 9 m target centred on it', () => {
    expect(run!.faceIds).toHaveLength(3);
    const target = targetFromWallRun(runFrames);
    expect(target).toMatchObject({ origin: [3, 1.5, 1.5], width: 3 * W, height: H, normal: [0, 0, 1] });
    expect(targetFromWallRun([...runFrames].reverse())).toEqual(target);
  });

  it('Repeat: one undistorted instance per bay, n × triangles, bays tile the run', () => {
    const placements = repeatPlacements(bay, runFrames);
    expect(placements).toHaveLength(3);
    for (const p of placements) expect(distortionDiagnostics(p)).toEqual([]);
    const xs = placements.map((p) => bounds(applyPlacement(bay, p))).map((b) => [+b.min[0]!.toFixed(5), +b.max[0]!.toFixed(5)]);
    expect(xs).toEqual([[-1.5, 1.5], [1.5, 4.5], [4.5, 7.5]]);
  });

  it('Stretch: ONE instance fitted to the whole run; a 9 m component fits a 3-bay run exactly', () => {
    const p = stretchPlacement(curtain, runFrames);
    expect(distortionDiagnostics(p)).toEqual([]);
    const b = bounds(applyPlacement(curtain, p));
    expect([b.min[0], b.max[0]].map((x) => +x!.toFixed(5))).toEqual([-1.5, 7.5]);
  });

  it('the semantics differ: Stretch distorts members, Repeat keeps the bay rhythm', () => {
    // Bay panel stretched over 3 bays: one window 3× wider, piers 1.8 m instead of 0.6 m.
    const stretched = stretchPlacement(bay, runFrames);
    expect(stretched.scaleAlong).toBeCloseTo(3, 9);
    expect(distortionDiagnostics(stretched).map((d) => d.code)).toEqual(['scaled-along']);
    const pier = bounds(applyPlacement(bay, stretched).subarray(0, 24));
    expect(pier.max[0]! - pier.min[0]!).toBeCloseTo(1.8, 5);
    // A 9 m curtain wall stretched over a 2-bay (6 m) run: 100 mm mullions become 66.7 mm.
    const twoBay = stretchPlacement(curtain, runFrames.slice(0, 2));
    const mullion = bounds(applyPlacement(curtain, twoBay).subarray(0, 24));
    expect(mullion.max[0]! - mullion.min[0]!).toBeCloseTo(0.1 * (6 / 9), 5);
    // The same 9 m component repeated per bay is squeezed to a third in every bay.
    expect(repeatPlacements(curtain, runFrames)[0]!.scaleAlong).toBeCloseTo(1 / 3, 9);
  });

  it('places a run on a +x wall from right to left in layout u without mirroring', () => {
    const xFaces = [[2, 0, 0], [2, 1, 0], [2, 2, 0]].map((c) => exteriorWall(2, c as [number, number, number], '+x'));
    const [xRun] = groupWallRuns(xFaces);
    const frames = xRun!.faceIds.map((id) => layoutFace(xFaces.find((f) => f.id === id)!).frame);
    const target = targetFromWallRun(frames);
    // Wall plane at three.X = 7.5; run spans grid y 0..2 → three.Z 1.5 .. −7.5, centre −3.
    expect(target).toMatchObject({ origin: [7.5, 1.5, -3], right: [0, 0, -1], width: 3 * W });
    const b = bounds(applyPlacement(curtain, stretchPlacement(curtain, frames)));
    expect([b.min[0], b.max[0], b.min[2], b.max[2]].map((x) => +x!.toFixed(5))).toEqual([7.5 + MOUNT, 7.5 + MOUNT + 0.2, -7.5, 1.5]);
  });

  it('refuses frames that are not one contiguous coplanar run', () => {
    expect(() => targetFromWallRun([])).toThrow();
    expect(() => targetFromWallRun([runFrames[0]!, runFrames[2]!])).toThrow(/contiguous/);
    expect(() => targetFromWallRun([runFrames[0]!, layoutFace(exteriorWall(2, [0, 0, 0], '-x')).frame])).toThrow(/normal/);
    expect(() => targetFromWallRun([runFrames[0]!, layoutFace(exteriorWall(2, [1, 0, 1], '-y')).frame])).toThrow(/coplanar/);
  });
});
