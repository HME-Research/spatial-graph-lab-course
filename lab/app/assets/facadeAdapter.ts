import { zUpToYUp } from '@core/viewer/axes';
import { DEFAULT_CELL_SIZE, type CellSize } from '@core/viewer/coordinates';
import { DEFAULT_WALL_THICKNESS, type FaceFrame, type Vec3 } from '@app/building/faceLayout';

/**
 * Façade adapter: façade geometry read out of a Rhino .3dm file → the app's face-layout frames.
 * Pure; no rhino3dm, React or Three.js import. The reader (`./rhino/reader.ts`, rhino3dm loaded
 * lazily) hands over plain triangle meshes in source units, Z-up.
 *
 * Provenance: promoted unchanged in behaviour from the wave2-G 3DM spike prototype
 * (`app/assets/3dm-spike/facadeAdapter.ts`, commit efe62a3); material groups were added for the
 * imported-façade implementation (2026-11-17).
 *
 * Source convention (the one a student uses when drawing a panel in Rhino's Front view):
 *   x = along the façade, z = up, y = depth; the exterior side faces −y by default (`outward`).
 *
 * Panel-local frame after normalisation, in metres:
 *   a = rightward as seen from OUTSIDE, b = up, c = outward; the source bounding box is moved so
 *   that a ∈ [0, width], b ∈ [0, height], c ∈ [0, depth] (c = 0 is the back, against the wall).
 *
 * The conversion goes through `zUpToYUp` (core/viewer/axes.ts), the single Z-up → Y-up adapter,
 * so for `outward: '-y'` the panel frame equals the Three.js frame of an app `-y` wall
 * (a = +X, b = +Y, c = +Z). `outward: '+y'` is a 180° rotation about the vertical axis, never a
 * mirror: triangle winding and handedness are preserved.
 */

export type SourceUnit = 'm' | 'cm' | 'mm' | 'in' | 'ft';
export type SourceOutward = '-y' | '+y';

export const METRES_PER_UNIT: Readonly<Record<SourceUnit, number>> = Object.freeze({ m: 1, cm: 0.01, mm: 0.001, in: 0.0254, ft: 0.3048 });

/** Rhino `UnitSystem` member name → supported unit; `None` → 'unitless'; anything else → 'unsupported'. */
export function unitFromRhinoName(name: string): SourceUnit | 'unitless' | 'unsupported' {
  switch (name) {
    case 'Meters':
      return 'm';
    case 'Centimeters':
      return 'cm';
    case 'Millimeters':
      return 'mm';
    case 'Inches':
      return 'in';
    case 'Feet':
      return 'ft';
    case 'None':
      return 'unitless';
    default:
      return 'unsupported';
  }
}

/** One triangle mesh in source units, Z-up: xyz triplets and triangle vertex indices. */
export interface SourceMesh {
  readonly positions: ArrayLike<number>;
  readonly indices: ArrayLike<number>;
  /** Index into `FacadeSource.groups` (default 0). */
  readonly group?: number;
}

/** A material group: what the meshes of one Rhino layer / colour / glass class look like. */
export interface SourceGroup {
  /** Readable name, e.g. the Rhino layer path ("Frame", "Glass"). */
  readonly name: string;
  /** `#rrggbb`. */
  readonly color: string;
  /** Rendered translucent (glazing). */
  readonly glass: boolean;
}

/** Group used when a source declares none. */
export const DEFAULT_SOURCE_GROUP: SourceGroup = Object.freeze({ name: 'Default', color: '#c8c2b8', glass: false });

export interface FacadeSource {
  readonly unit: SourceUnit | 'unitless';
  readonly meshes: readonly SourceMesh[];
  /** Material groups referenced by `SourceMesh.group` (default: one `DEFAULT_SOURCE_GROUP`). */
  readonly groups?: readonly SourceGroup[];
  /** Which source side is the exterior (default '-y', Rhino Front view). */
  readonly outward?: SourceOutward;
}

/** A material group of a normalised component: triangles `start .. start + count - 1`. */
export interface ComponentGroup extends SourceGroup {
  /** First triangle (not index) of the group. */
  readonly start: number;
  /** Number of triangles. */
  readonly count: number;
}

export interface NormaliseOptions {
  /** Required to accept a unitless file; never guessed. */
  readonly assumeUnitlessAs?: SourceUnit;
  /** Triangle budget for one component (default 100 000). */
  readonly maxTriangles?: number;
  /** Largest plausible panel extent in metres (default 50): catches mm files declared as metres. */
  readonly maxExtentMetres?: number;
  /** Largest plausible depth (outward) in metres (default 1): rejects whole buildings or wrong axes. */
  readonly maxDepthMetres?: number;
}

export interface Diagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: string;
  readonly message: string;
}

export interface FacadeComponent {
  /** Panel-local (a, b, c) triplets in metres; see the module comment. */
  readonly positions: Float64Array;
  /** Triangle vertex indices, ordered by group (see `groups`). */
  readonly indices: Uint32Array;
  /** Non-empty groups in source group order; together they cover every triangle exactly once. */
  readonly groups: readonly ComponentGroup[];
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly metresPerUnit: number;
  readonly outward: SourceOutward;
  /** Source bounding box in source units, Z-up (for diagnostics and UI). */
  readonly sourceBounds: { readonly min: Vec3; readonly max: Vec3 };
}

/** What placement needs of a component: its panel-frame extent along the façade and upward. */
export type ComponentSize = Pick<FacadeComponent, 'width' | 'height'> & { readonly depth?: number };

export type NormaliseResult =
  | { readonly ok: true; readonly component: FacadeComponent; readonly diagnostics: readonly Diagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

const EPS = 1e-9;
const error = (code: string, message: string): Diagnostic => ({ severity: 'error', code, message });
const warning = (code: string, message: string): Diagnostic => ({ severity: 'warning', code, message });

/**
 * Validate meshes, convert units and axes once, and normalise the bounding box. Never throws for
 * bad input: every refusal is an `error` diagnostic and nothing is returned.
 */
export function normaliseFacadeSource(source: FacadeSource, options: NormaliseOptions = {}): NormaliseResult {
  const diagnostics: Diagnostic[] = [];
  const maxTriangles = options.maxTriangles ?? 100_000;
  const maxExtent = options.maxExtentMetres ?? 50;
  const maxDepth = options.maxDepthMetres ?? 1;
  const outward = source.outward ?? '-y';

  let unit: SourceUnit;
  if (source.unit === 'unitless') {
    if (!options.assumeUnitlessAs) return { ok: false, diagnostics: [error('units-unknown', 'The file has no unit system; choose its unit explicitly before import.')] };
    unit = options.assumeUnitlessAs;
    diagnostics.push(warning('units-assumed', `Unitless file read as ${unit} by explicit choice.`));
  } else if (source.unit in METRES_PER_UNIT) {
    unit = source.unit;
  } else {
    return { ok: false, diagnostics: [error('units-unsupported', `Unsupported unit "${String(source.unit)}".`)] };
  }
  const scale = METRES_PER_UNIT[unit];

  if (source.meshes.length === 0) return { ok: false, diagnostics: [error('no-geometry', 'No mesh geometry to import (Breps need render meshes saved in the file).')] };
  const sourceGroups = source.groups && source.groups.length > 0 ? source.groups : [DEFAULT_SOURCE_GROUP];

  let vertexCount = 0;
  let triangleCount = 0;
  for (const [m, mesh] of source.meshes.entries()) {
    const group = mesh.group ?? 0;
    if (!Number.isInteger(group) || group < 0 || group >= sourceGroups.length) return { ok: false, diagnostics: [error('invalid-mesh', `Mesh ${m}: unknown material group ${group}.`)] };
    const nv = mesh.positions.length / 3;
    if (!Number.isInteger(nv) || nv === 0) return { ok: false, diagnostics: [error('invalid-mesh', `Mesh ${m}: positions are not xyz triplets.`)] };
    if (mesh.indices.length % 3 !== 0 || mesh.indices.length === 0) return { ok: false, diagnostics: [error('invalid-mesh', `Mesh ${m}: indices are not triangles.`)] };
    for (let i = 0; i < mesh.positions.length; i++) {
      if (!Number.isFinite(mesh.positions[i])) return { ok: false, diagnostics: [error('invalid-mesh', `Mesh ${m}: non-finite coordinate.`)] };
    }
    for (let i = 0; i < mesh.indices.length; i++) {
      const index = mesh.indices[i]!;
      if (!Number.isInteger(index) || index < 0 || index >= nv) return { ok: false, diagnostics: [error('invalid-mesh', `Mesh ${m}: index ${index} out of range.`)] };
    }
    vertexCount += nv;
    triangleCount += mesh.indices.length / 3;
  }
  if (triangleCount > maxTriangles) return { ok: false, diagnostics: [error('too-many-triangles', `${triangleCount} triangles exceed the budget of ${maxTriangles}.`)] };

  const positions = new Float64Array(vertexCount * 3);
  const indices = new Uint32Array(triangleCount * 3);
  const srcMin = [Infinity, Infinity, Infinity];
  const srcMax = [-Infinity, -Infinity, -Infinity];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let pv = 0;
  let pi = 0;
  // Vertices keep source order; triangles are emitted group by group (stable within a group).
  const triangleRanges: { readonly mesh: SourceMesh; readonly base: number }[] = [];
  for (const mesh of source.meshes) {
    const base = pv / 3;
    triangleRanges.push({ mesh, base });
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const p: [number, number, number] = [mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!];
      for (let k = 0; k < 3; k++) {
        srcMin[k] = Math.min(srcMin[k]!, p[k]!);
        srcMax[k] = Math.max(srcMax[k]!, p[k]!);
      }
      const [X, Y, Z] = zUpToYUp(p, scale);
      // '-y' outward: panel frame = Three frame. '+y': rotate 180° about Y (a = −X, c = −Z).
      const abc = outward === '-y' ? [X, Y, Z] : [-X, Y, -Z];
      for (let k = 0; k < 3; k++) {
        positions[pv + k] = abc[k]!;
        min[k] = Math.min(min[k]!, abc[k]!);
        max[k] = Math.max(max[k]!, abc[k]!);
      }
      pv += 3;
    }
  }
  const groups: ComponentGroup[] = [];
  sourceGroups.forEach((group, g) => {
    const start = pi / 3;
    for (const { mesh, base } of triangleRanges) {
      if ((mesh.group ?? 0) !== g) continue;
      for (let i = 0; i < mesh.indices.length; i++) indices[pi++] = mesh.indices[i]! + base;
    }
    const count = pi / 3 - start;
    if (count > 0) groups.push({ name: group.name, color: group.color, glass: group.glass, start, count });
  });
  for (let i = 0; i < positions.length; i++) positions[i] = positions[i]! - min[i % 3]! + 0;

  const width = max[0]! - min[0]!;
  const height = max[1]! - min[1]!;
  const depth = max[2]! - min[2]!;
  if (width <= EPS || height <= EPS) return { ok: false, diagnostics: [error('degenerate-bounds', 'The panel has no extent along the façade or upward; check the outward axis and that the panel is drawn in the XZ plane.')] };
  if (Math.max(width, height, depth) > maxExtent)
    return { ok: false, diagnostics: [error('implausible-size', `Panel is ${width.toFixed(2)} × ${height.toFixed(2)} × ${depth.toFixed(2)} m; check the file units.`)] };
  if (depth > maxDepth) return { ok: false, diagnostics: [error('too-deep', `Panel is ${depth.toFixed(2)} m deep (limit ${maxDepth} m); a façade component is drawn in the XZ plane with y as its depth.`)] };

  return {
    ok: true,
    diagnostics,
    component: {
      positions,
      indices,
      groups,
      width,
      height,
      depth,
      metresPerUnit: scale,
      outward,
      sourceBounds: { min: [srcMin[0]!, srcMin[1]!, srcMin[2]!], max: [srcMax[0]!, srcMax[1]!, srcMax[2]!] },
    },
  };
}

/** A rectangle on the outer wall plane that receives one component instance (Three.js world, metres). */
export interface PanelTarget {
  /** Centre of the rectangle on the wall's centre plane (a FaceLayout origin or a run midpoint). */
  readonly origin: Vec3;
  /** Rightward as seen from outside: `up × normal`. Not always the layout `u` (see `targetFromFaceFrame`). */
  readonly right: Vec3;
  readonly up: Vec3;
  readonly normal: Vec3;
  readonly width: number;
  readonly height: number;
}

const cross = (p: Vec3, q: Vec3): Vec3 => [p[1] * q[2] - p[2] * q[1] + 0, p[2] * q[0] - p[0] * q[2] + 0, p[0] * q[1] - p[1] * q[0] + 0];
const dot = (p: Vec3, q: Vec3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];

function assertWallFrame(frame: FaceFrame): void {
  if (Math.abs(frame.v[1] - 1) > EPS || Math.abs(frame.normal[1]) > EPS) throw new RangeError('Façade components apply to wall faces only (v up, horizontal normal).');
}

/**
 * Target for ONE bay (Repeat). Width/height are the nominal cell (bay) size, not `frame.width`,
 * which for ±x walls includes one wall thickness to close corners. On `+x` and `+y` walls the
 * layout `u` points LEFT as seen from outside, so `right = up × normal` is used instead of `u`
 * to keep the component unmirrored.
 */
export function targetFromFaceFrame(frame: FaceFrame, cell: CellSize = DEFAULT_CELL_SIZE): PanelTarget {
  assertWallFrame(frame);
  return { origin: frame.origin, right: cross(frame.v, frame.normal), up: frame.v, normal: frame.normal, width: cell.horizontal, height: cell.vertical };
}

/**
 * Target for ONE wall run (Stretch): the frames of a `WallRun`'s faces (any order). They must share
 * normal and plane and be contiguous bays; the target spans n × bay width, centred on the run.
 */
export function targetFromWallRun(frames: readonly FaceFrame[], cell: CellSize = DEFAULT_CELL_SIZE): PanelTarget {
  const first = frames[0];
  if (!first) throw new RangeError('A wall run needs at least one face.');
  for (const f of frames) {
    assertWallFrame(f);
    if (dot(f.normal, first.normal) < 1 - EPS) throw new RangeError('Wall-run faces must share one outward normal.');
    const d: Vec3 = [f.origin[0] - first.origin[0], f.origin[1] - first.origin[1], f.origin[2] - first.origin[2]];
    if (Math.abs(dot(d, first.normal)) > 1e-6 || Math.abs(d[1]) > 1e-6) throw new RangeError('Wall-run faces must be coplanar and on one storey.');
  }
  const base = targetFromFaceFrame(first, cell);
  const along = frames.map((f) => dot([f.origin[0] - first.origin[0], f.origin[1] - first.origin[1], f.origin[2] - first.origin[2]], base.right)).sort((p, q) => p - q);
  for (let i = 1; i < along.length; i++) {
    if (Math.abs(along[i]! - along[i - 1]! - cell.horizontal) > 1e-6) throw new RangeError('Wall-run faces must be contiguous bays without gaps or duplicates.');
  }
  const mid = (along[0]! + along[along.length - 1]!) / 2;
  const origin: Vec3 = [first.origin[0] + base.right[0] * mid + 0, first.origin[1] + base.right[1] * mid + 0, first.origin[2] + base.right[2] * mid + 0];
  return { ...base, origin, width: frames.length * cell.horizontal };
}

export interface PlacementOptions {
  /** Distance from the wall centre plane to the component's back (default half the wall thickness). */
  readonly mountOffset?: number;
  /**
   * Turn the component round (180° about its vertical centre line): its back becomes the outside.
   * A rotation, never a mirror; the back stays against the building. Needs `component.depth`.
   */
  readonly flip?: boolean;
}

export interface Placement {
  /** Column-major 4×4 affine matrix (Three.js `Matrix4.fromArray` order): panel (a, b, c) → world. */
  readonly matrix: Float64Array;
  /** Scale applied along the façade and upward (depth is never scaled). */
  readonly scaleAlong: number;
  readonly scaleUp: number;
}

/**
 * Fit a component into a target: the bounding box is scaled to exactly target width × height
 * (non-uniform), depth kept, back face set `mountOffset` outside the wall centre plane.
 */
export function placeComponent(component: ComponentSize, target: PanelTarget, options: PlacementOptions = {}): Placement {
  const mount = options.mountOffset ?? DEFAULT_WALL_THICKNESS / 2;
  const sa = target.width / component.width;
  const sb = target.height / component.height;
  const { right: r, up: u, normal: n, origin: o } = target;
  const t: Vec3 = [
    o[0] - r[0] * (target.width / 2) - u[0] * (target.height / 2) + n[0] * mount,
    o[1] - r[1] * (target.width / 2) - u[1] * (target.height / 2) + n[1] * mount,
    o[2] - r[2] * (target.width / 2) - u[2] * (target.height / 2) + n[2] * mount,
  ];
  if (options.flip) {
    // (a, b, c) → (width − a, b, depth − c): the world point of (a, b, c) on the turned component.
    const d = component.depth ?? 0;
    const w = target.width;
    // prettier-ignore
    const matrix = new Float64Array([
      -r[0] * sa, -r[1] * sa, -r[2] * sa, 0,
      u[0] * sb, u[1] * sb, u[2] * sb, 0,
      -n[0], -n[1], -n[2], 0,
      t[0] + r[0] * w + n[0] * d, t[1] + r[1] * w + n[1] * d, t[2] + r[2] * w + n[2] * d, 1,
    ]).map((x) => x + 0);
    return { matrix, scaleAlong: sa, scaleUp: sb };
  }
  // prettier-ignore
  const matrix = new Float64Array([
    r[0] * sa, r[1] * sa, r[2] * sa, 0,
    u[0] * sb, u[1] * sb, u[2] * sb, 0,
    n[0], n[1], n[2], 0,
    t[0], t[1], t[2], 1,
  ]).map((x) => x + 0);
  return { matrix, scaleAlong: sa, scaleUp: sb };
}

/** Repeat unit bays: one fitted instance per wall face (bay), in the given face order. */
export function repeatPlacements(component: ComponentSize, frames: readonly FaceFrame[], cell: CellSize = DEFAULT_CELL_SIZE, options: PlacementOptions = {}): Placement[] {
  return frames.map((frame) => placeComponent(component, targetFromFaceFrame(frame, cell), options));
}

/** Stretch wall run: ONE instance fitted across the whole run. */
export function stretchPlacement(component: ComponentSize, runFrames: readonly FaceFrame[], cell: CellSize = DEFAULT_CELL_SIZE, options: PlacementOptions = {}): Placement {
  return placeComponent(component, targetFromWallRun(runFrames, cell), options);
}

/** Warn when a placement distorts the component by more than `tolerance` (default 5 %). */
export function distortionDiagnostics(placement: Placement, tolerance = 0.05): Diagnostic[] {
  const out: Diagnostic[] = [];
  if (Math.abs(placement.scaleAlong - 1) > tolerance) out.push(warning('scaled-along', `Component scaled ×${placement.scaleAlong.toFixed(3)} along the façade.`));
  if (Math.abs(placement.scaleUp - 1) > tolerance) out.push(warning('scaled-up', `Component scaled ×${placement.scaleUp.toFixed(3)} vertically.`));
  return out;
}

/** Apply a placement to a component's positions (for tests, or to merge static geometry). */
export function applyPlacement(component: FacadeComponent, placement: Placement): Float32Array {
  const m = placement.matrix;
  const p = component.positions;
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    const a = p[i]!;
    const b = p[i + 1]!;
    const c = p[i + 2]!;
    out[i] = m[0]! * a + m[4]! * b + m[8]! * c + m[12]!;
    out[i + 1] = m[1]! * a + m[5]! * b + m[9]! * c + m[13]!;
    out[i + 2] = m[2]! * a + m[6]! * b + m[10]! * c + m[14]!;
  }
  return out;
}

/** Rotation about world +Y (degrees) that turns the panel's outward axis (+Z) to `normal`. */
export function wallRotationDegrees(normal: Vec3): number {
  return (Math.atan2(normal[0], normal[2]) * 180) / Math.PI + 0;
}
