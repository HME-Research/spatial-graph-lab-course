import type { GridCoord } from '@app/document';
import { DEFAULT_CELL_SIZE, spatialToThree, type CellSize, type WorldPoint } from '@core/viewer/coordinates';
import { FACE_DIRECTION_OFFSETS, type FaceCondition, type FaceDirection, type FaceOrientation, type FacadeProvider, type ResolvedFace } from './contracts';
import { clampWindowFraction, exampleFacadeProvider } from './facade';

/**
 * Face layout (Gate F, F-C): ONE place that decides, per resolved face, which parts of the face
 * are solid and where its openings are, in face-local metres. Pure; no Three.js.
 *
 * `buildArchitecture` (3D boxes) consumes it, and the Plan view (workstream C) will consume the
 * same layout, so a door, window or slab opening is placed identically in every view.
 *
 * Face-local frame: `origin` is the face CENTRE in Three.js world space; `u` runs along the face,
 * `v` is up for walls (Three.js +Y) and along Three.js +Z for slabs; `normal` points outward from
 * the owner cell. Rectangles (`FaceRect`) are centred on the origin: `u0..u1` within
 * `[-width/2, width/2]`, `v0..v1` within `[-height/2, height/2]`. (Centred rather than
 * corner-based so the 3D geometry is reproduced bit-for-bit from the same arithmetic.)
 */

export type Vec3 = readonly [number, number, number];

/** Rectangle in a face's local (u, v) plane, in metres, centred on the face origin. */
export interface FaceRect {
  readonly u0: number;
  readonly u1: number;
  readonly v0: number;
  readonly v1: number;
}

export interface FaceFrame {
  /** Face centre in Three.js world space. */
  readonly origin: WorldPoint;
  /** Unit vector along the face (a positive Three.js axis). */
  readonly u: Vec3;
  /** Unit vector across the face: up for walls, Three.js +Z for slabs. */
  readonly v: Vec3;
  /** Outward unit normal from the owner cell. */
  readonly normal: Vec3;
  /** Panel extent along u (±x walls include one wall thickness so outer corners close). */
  readonly width: number;
  /** Panel extent along v. */
  readonly height: number;
}

export type FaceOpeningKind = 'window' | 'door' | 'open' | 'slab-void' | 'slab-opening' | 'access-marker';

export interface FaceOpening {
  readonly kind: FaceOpeningKind;
  readonly rect: FaceRect;
  /** The relationship that made the opening; null for a façade window. */
  readonly edgeId: string | null;
}

export interface FaceLayout<F extends ResolvedFace = ResolvedFace> {
  readonly faceId: string;
  readonly face: F;
  readonly frame: FaceFrame;
  /** Solid panel parts (wall / slab / roof), in emission order. Empty for an `open` wall. */
  readonly solids: readonly FaceRect[];
  /** Openings, in emission order. */
  readonly openings: readonly FaceOpening[];
}

/** How a node type's windows are placed along its walls (default: `repeat`). */
export type WindowLayoutProvider = (typeId: string) => 'repeat' | 'stretch';

export interface FaceLayoutOptions {
  readonly cell?: CellSize;
  readonly facade?: FacadeProvider;
  /** Window placement per node type (absent: every type repeats one window per bay). */
  readonly windowLayout?: WindowLayoutProvider;
  readonly wallThickness?: number;
}

/** Abstract opening proportions, relative to the cell, with absolute caps in metres. */
export const OPENING_PROPORTIONS = Object.freeze({
  doorWidth: 1.0,
  doorWidthMaxFraction: 0.5,
  doorHeight: 2.2,
  doorHeightMaxFraction: 0.8,
  /** Atrium: large central void, as a fraction of the cell width on each side. */
  atriumFraction: 0.7,
  /** Vertical access: smaller off-centre opening (fractions of cell width along X and Z). */
  accessWidthFraction: 0.35,
  accessDepthFraction: 0.6,
  accessOffsetFraction: 0.25,
  markerWidth: 0.12,
  thresholdDepthFraction: 0.5,
});

export const DEFAULT_WALL_THICKNESS = 0.15;
export const DEFAULT_SLAB_THICKNESS = 0.2;
const EPS = 1e-9;

/** Grid-space face centre = cell + offset / 2, mapped to world space. */
export function faceCentre(cell: GridCoord, direction: FaceDirection, size: CellSize = DEFAULT_CELL_SIZE): WorldPoint {
  const o = FACE_DIRECTION_OFFSETS[direction];
  return spatialToThree([cell[0] + o[0] / 2, cell[1] + o[1] / 2, cell[2] + o[2] / 2], size);
}

const AXES: readonly Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** Outward normal in Three.js space (grid y maps to −Z, grid z to +Y). */
const NORMALS: Readonly<Record<FaceDirection, Vec3>> = {
  '+x': [1, 0, 0],
  '-x': [-1, 0, 0],
  '+y': [0, 0, -1],
  '-y': [0, 0, 1],
  '+z': [0, 1, 0],
  '-z': [0, -1, 0],
};

/** World axis index (0 = X, 1 = Y, 2 = Z) of a unit axis vector. */
export const axisIndex = (vector: Vec3): 0 | 1 | 2 => (vector[0] !== 0 ? 0 : vector[1] !== 0 ? 1 : 2);

function frameFor(direction: FaceDirection, origin: WorldPoint, cell: CellSize, wallThickness: number): FaceFrame {
  const W = cell.horizontal;
  const H = cell.vertical;
  const normal = NORMALS[direction];
  switch (direction) {
    case '+x':
    case '-x':
      // ±x walls run along Z and are extended by one wall thickness so outer corners close.
      return { origin, u: AXES[2]!, v: AXES[1]!, normal, width: W + wallThickness, height: H };
    case '+y':
    case '-y':
      return { origin, u: AXES[0]!, v: AXES[1]!, normal, width: W, height: H };
    case '+z':
    case '-z':
      return { origin, u: AXES[0]!, v: AXES[2]!, normal, width: W, height: W };
  }
}

export const fullFaceRect = (frame: Pick<FaceFrame, 'width' | 'height'>): FaceRect => ({
  u0: -frame.width / 2,
  u1: frame.width / 2,
  v0: -frame.height / 2,
  v1: frame.height / 2,
});

/** Split a panel into up to four rectangles surrounding `hole` (no CSG). */
export function rectsAroundHole(panel: FaceRect, hole: FaceRect): FaceRect[] {
  const h = {
    u0: Math.max(panel.u0, hole.u0),
    u1: Math.min(panel.u1, hole.u1),
    v0: Math.max(panel.v0, hole.v0),
    v1: Math.min(panel.v1, hole.v1),
  };
  if (h.u1 - h.u0 <= EPS || h.v1 - h.v0 <= EPS) return [panel];
  const parts: FaceRect[] = [
    { u0: panel.u0, u1: h.u0, v0: panel.v0, v1: panel.v1 },
    { u0: h.u1, u1: panel.u1, v0: panel.v0, v1: panel.v1 },
    { u0: h.u0, u1: h.u1, v0: panel.v0, v1: h.v0 },
    { u0: h.u0, u1: h.u1, v0: h.v1, v1: panel.v1 },
  ];
  return parts.filter((r) => r.u1 - r.u0 > EPS && r.v1 - r.v0 > EPS);
}

/**
 * Window of one cell bay whose area is `fraction` of the bay's wall area.
 * - `repeat` (default): centred, with the wall's proportions, so each bay gets its own window;
 * - `stretch`: full bay width and `fraction` of its height, centred vertically, so neighbouring
 *   bays of a wall join into one continuous band.
 */
export function windowRect(cell: CellSize, fraction: number, layout: 'repeat' | 'stretch' = 'repeat'): FaceRect | null {
  const f = clampWindowFraction(fraction);
  if (f <= 0) return null;
  if (layout === 'stretch') {
    const half = cell.horizontal / 2;
    const h = (cell.vertical * f) / 2;
    return { u0: -half, u1: half, v0: -h, v1: h };
  }
  const s = Math.sqrt(f);
  const w = (cell.horizontal * s) / 2;
  const h = (cell.vertical * s) / 2;
  return { u0: -w, u1: w, v0: -h, v1: h };
}

export function doorRect(cell: CellSize): FaceRect {
  const p = OPENING_PROPORTIONS;
  const w = Math.min(p.doorWidth, cell.horizontal * p.doorWidthMaxFraction) / 2;
  const h = Math.min(p.doorHeight, cell.vertical * p.doorHeightMaxFraction);
  const floor = -cell.vertical / 2;
  return { u0: -w, u1: w, v0: floor, v1: floor + h };
}

export function atriumRect(cell: CellSize): FaceRect {
  const a = (cell.horizontal * OPENING_PROPORTIONS.atriumFraction) / 2;
  return { u0: -a, u1: a, v0: -a, v1: a };
}

/** Off-centre toward world +X, so it is identical whichever storey authors the slab. */
export function accessRect(cell: CellSize): FaceRect {
  const p = OPENING_PROPORTIONS;
  const W = cell.horizontal;
  const cu = W * p.accessOffsetFraction;
  const hw = (W * p.accessWidthFraction) / 2;
  const hd = (W * p.accessDepthFraction) / 2;
  return { u0: cu - hw, u1: cu + hw, v0: -hd, v1: hd };
}

/** Area of a slab or wall opening for a condition, in m² (0 when there is none). Useful for tests/UI. */
export function openingArea(condition: FaceCondition, orientation: FaceOrientation, cell: CellSize = DEFAULT_CELL_SIZE): number {
  const area = (r: FaceRect) => (r.u1 - r.u0) * (r.v1 - r.v0);
  if (orientation === 'slab') {
    if (condition === 'atrium') return area(atriumRect(cell));
    if (condition === 'vertical-access') return area(accessRect(cell));
    return 0;
  }
  if (condition === 'door') return area(doorRect(cell));
  if (condition === 'open') return cell.horizontal * cell.vertical;
  return 0;
}

/** Layout of one face. */
export function layoutFace<F extends ResolvedFace>(face: F, options: FaceLayoutOptions = {}): FaceLayout<F> {
  const cell = options.cell ?? DEFAULT_CELL_SIZE;
  const facade = options.facade ?? exampleFacadeProvider;
  const wallT = options.wallThickness ?? DEFAULT_WALL_THICKNESS;
  const frame = frameFor(face.direction, faceCentre(face.cell, face.direction, cell), cell, wallT);
  const panel = fullFaceRect(frame);
  const solids: FaceRect[] = [];
  const openings: FaceOpening[] = [];
  const opening = (kind: FaceOpeningKind, rect: FaceRect, edgeId: string | null = face.edgeId) => openings.push({ kind, rect, edgeId });

  if (face.orientation === 'wall') {
    switch (face.condition) {
      case 'exterior': {
        const hole = windowRect(cell, facade(face.ownerTypeId).windowFraction, options.windowLayout?.(face.ownerTypeId));
        if (hole === null) solids.push(panel);
        else {
          solids.push(...rectsAroundHole(panel, hole));
          opening('window', hole, null);
        }
        break;
      }
      case 'door': {
        const hole = doorRect(cell);
        solids.push(...rectsAroundHole(panel, hole));
        opening('door', hole);
        break;
      }
      case 'open':
        // No partition at all.
        opening('open', panel);
        break;
      default:
        // `solid` internal partition (vertical kinds cannot occur on a wall in a valid document).
        solids.push(panel);
    }
  } else {
    switch (face.condition) {
      case 'atrium': {
        const hole = atriumRect(cell);
        solids.push(...rectsAroundHole(panel, hole));
        opening('slab-void', hole);
        break;
      }
      case 'vertical-access': {
        const hole = accessRect(cell);
        solids.push(...rectsAroundHole(panel, hole));
        opening('slab-opening', hole);
        const m = OPENING_PROPORTIONS.markerWidth;
        const mid = (hole.u0 + hole.u1) / 2;
        opening('access-marker', { u0: mid - m / 2, u1: mid + m / 2, v0: -m / 2, v1: m / 2 });
        break;
      }
      default:
        // `exterior` (roof / underside) or `solid` separation between storeys.
        solids.push(panel);
    }
  }
  return { faceId: face.id, face, frame, solids, openings };
}

/** Layout of every face, in input order. Pure and deterministic. */
export function layoutFaces<F extends ResolvedFace>(faces: readonly F[], options: FaceLayoutOptions = {}): FaceLayout<F>[] {
  return faces.map((face) => layoutFace(face, options));
}

/** Axis-aligned world box of a face-local rectangle with the given thickness along the normal. */
export function faceRectBox(frame: FaceFrame, rect: FaceRect, thickness: number): { position: WorldPoint; size: WorldPoint } {
  const n = axisIndex(frame.normal);
  const u = axisIndex(frame.u);
  const v = axisIndex(frame.v);
  const position = [...frame.origin] as [number, number, number];
  position[u] += (rect.u0 + rect.u1) / 2;
  position[v] += (rect.v0 + rect.v1) / 2;
  const size = [0, 0, 0] as [number, number, number];
  size[n] = thickness;
  size[u] = rect.u1 - rect.u0;
  size[v] = rect.v1 - rect.v0;
  return { position, size };
}
