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
  readonly edgeId: number | null;
}

export interface FaceLayout<F extends ResolvedFace = ResolvedFace> {
  readonly faceId: string;
  readonly face: F;
  readonly frame: FaceFrame;
  /** Solid panel parts (wall / slab / roof), in emission order. Empty for an `open` wall. */
  readonly solids: readonly FaceRect[];
  /**
   * Indices into `solids` of the wall strips beside a corridor narrower than the cell, at the
   * corridor's end (2026-11-20), when they are the owner's EXTERIOR façade wall (styled by its
   * look): an enclosed room at an open-sided corridor, or an open-sided room's posts. Absent when none.
   */
  readonly facadeStrips?: readonly number[];
  /**
   * Indices into `solids` of those strips when they are INTERNAL walls: an enclosed room at an
   * enclosed corridor (owner override 2026-11-20). Absent when none.
   */
  readonly internalStrips?: readonly number[];
  /** Openings, in emission order. */
  readonly openings: readonly FaceOpening[];
}

/** How a node type's windows are placed along its walls (default: `repeat`). */
export type WindowLayoutProvider = (functionId: string) => 'repeat' | 'stretch';
/** Whether a node type's exterior walls are built (default: `enclosed`). */
export type WallStyleProvider = (functionId: string) => 'enclosed' | 'open';
/** A node type's roof on exposed tops (default: `flat`; `none` tops are removed before layout). */
export type RoofStyleProvider = (functionId: string) => 'flat' | 'pergola' | 'none';

export interface FaceLayoutOptions {
  readonly cell?: CellSize;
  readonly facade?: FacadeProvider;
  /** Window placement per node type (absent: every type repeats one window per bay). */
  readonly windowLayout?: WindowLayoutProvider;
  /** Open types have no exterior walls (absent: every type is enclosed). */
  readonly walls?: WallStyleProvider;
  /** Roof per node type: pergola tops are laid out as slats (absent: flat). */
  readonly roof?: RoofStyleProvider;
  readonly wallThickness?: number;
  /**
   * What the style providers above are keyed by: the face's node TYPE (default) or its owner
   * NODE id (`'node'`: per-room looks, "Style rooms by", 2026-11-18).
   */
  readonly styleKey?: 'type' | 'node';
}

/** The key the style providers are called with for `face` (see `FaceLayoutOptions.styleKey`). */
export const styleKeyOf = (face: Pick<ResolvedFace, 'ownerNodeId' | 'ownerFunction'>, options: Pick<FaceLayoutOptions, 'styleKey'>): string =>
  options.styleKey === 'node' ? String(face.ownerNodeId) : face.ownerFunction;

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
  /** Open-sided rooms with a roof: a slim post at each bay edge (m). */
  postWidth: 0.15,
  /** Pergola: slats across each roof bay, as a fraction of the bay width, and how many per bay. */
  pergolaSlatFraction: 0.06,
  pergolaSlats: 6,
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
 * Repeat window of one cell bay: centred, with the bay's proportions, area `fraction` of the bay's
 * wall. (Stretch windows span a whole façade instead; see `stretchWindows`.)
 */
export function windowRect(cell: CellSize, fraction: number): FaceRect | null {
  const f = clampWindowFraction(fraction);
  if (f <= 0) return null;
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

/** `rect` no wider than `width` (centred on u = 0), or unchanged without a width. */
function narrowTo(rect: FaceRect, width: number | undefined): FaceRect {
  if (width === undefined || rect.u1 - rect.u0 <= width) return rect;
  return { ...rect, u0: -width / 2, u1: width / 2 };
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

const dot = (a: Vec3 | WorldPoint, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** One bay's share of a Stretch window: its glass parts and the wall parts around them. */
export interface StretchBay {
  readonly glass: readonly FaceRect[];
  readonly solid: readonly FaceRect[];
}

/** Merge rectangles of one 3×3 grid: first along u within a row, then identical u spans along v. */
function mergeGrid(rects: readonly FaceRect[]): FaceRect[] {
  const rows: FaceRect[] = [];
  for (const r of [...rects].sort((p, q) => p.v0 - q.v0 || p.u0 - q.u0)) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.v0 - r.v0) < EPS && Math.abs(last.v1 - r.v1) < EPS && Math.abs(last.u1 - r.u0) < EPS) rows[rows.length - 1] = { ...last, u1: r.u1 };
    else rows.push(r);
  }
  const out: FaceRect[] = [];
  for (const r of rows.sort((p, q) => p.u0 - q.u0 || p.u1 - q.u1 || p.v0 - q.v0)) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.u0 - r.u0) < EPS && Math.abs(last.u1 - r.u1) < EPS && Math.abs(last.v1 - r.v0) < EPS) out[out.length - 1] = { ...last, v1: r.v1 };
    else out.push(r);
  }
  return out;
}

/**
 * Stretch windows: each FAÇADE (the exterior walls of one room on one side, over all its bays and
 * storeys) gets ONE window that follows the façade's own outline, inset by an even frame: an L-shaped
 * façade gets an L-shaped window, never a rectangle floating in the middle.
 *
 * Each bay is split into a 3×3 grid (frame | middle | frame, along and up). The middle is glass; an
 * edge strip is glass only where the façade continues past that edge (so neighbouring bays join with
 * no dividing wall); a corner only where the façade continues on both sides AND diagonally (so an
 * inner corner of an L keeps its frame). The frame is `t·W/2` along and `t·H/2` up, with `t` solved
 * per façade so the glass is `windowFraction` of the façade's area (one bay: the Repeat window).
 * Returns the glass and wall parts of every exterior wall face whose type uses `stretch`.
 */
export function stretchWindows(faces: readonly ResolvedFace[], options: FaceLayoutOptions = {}): Map<string, StretchBay> {
  const out = new Map<string, StretchBay>();
  const layoutOf = options.windowLayout;
  if (!layoutOf) return out;
  const cell = options.cell ?? DEFAULT_CELL_SIZE;
  const facade = options.facade ?? exampleFacadeProvider;
  const wallT = options.wallThickness ?? DEFAULT_WALL_THICKNESS;
  const W = cell.horizontal;
  const H = cell.vertical;
  type Bay = { readonly face: ResolvedFace; readonly frame: FaceFrame; readonly along: number; readonly up: number };
  const groups = new Map<string, Bay[]>();
  for (const face of faces) {
    if (face.orientation !== 'wall' || face.condition !== 'exterior' || layoutOf(styleKeyOf(face, options)) !== 'stretch') continue;
    if (options.walls?.(styleKeyOf(face, options)) === 'open') continue;
    const frame = frameFor(face.direction, faceCentre(face.cell, face.direction, cell), cell, wallT);
    const key = `${face.ownerNodeId}\u0000${face.direction}`;
    const bays = groups.get(key) ?? [];
    bays.push({ face, frame, along: dot(frame.origin, frame.u), up: dot(frame.origin, frame.v) });
    groups.set(key, bays);
  }
  for (const bays of groups.values()) {
    const f = clampWindowFraction(facade(styleKeyOf(bays[0]!.face, options)).windowFraction);
    const u0 = Math.min(...bays.map((b) => b.along));
    const v0 = Math.min(...bays.map((b) => b.up));
    const at = (b: Bay): [number, number] => [Math.round((b.along - u0) / W), Math.round((b.up - v0) / H)];
    const exposed = new Set(bays.map((b) => at(b).join(',')));
    const has = (i: number, j: number) => exposed.has(`${i},${j}`);
    /** 3×3 glass mask of a bay: [column 0..2 along u][row 0..2 along v]. */
    const masks = bays.map((b) => {
      const [i, j] = at(b);
      const side = [has(i - 1, j), true, has(i + 1, j)];
      const level = [has(i, j - 1), true, has(i, j + 1)];
      return [0, 1, 2].map((c) =>
        [0, 1, 2].map((r) => {
          if (c === 1 || r === 1) return side[c]! && level[r]!;
          return side[c]! && level[r]! && has(i + c - 1, j + r - 1);
        }),
      );
    });
    // Glass area for a frame of t (0..1): monotone decreasing, so solve t by bisection.
    const glassArea = (t: number) => {
      const mu = (t * W) / 2;
      const mv = (t * H) / 2;
      const cw = [mu, W - 2 * mu, mu];
      const rh = [mv, H - 2 * mv, mv];
      let sum = 0;
      for (const m of masks) for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) if (m[c]![r]) sum += cw[c]! * rh[r]!;
      return sum;
    };
    const target = f * bays.length * W * H;
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (glassArea(mid) > target) lo = mid;
      else hi = mid;
    }
    const t = f >= 1 ? 0 : (lo + hi) / 2;
    const mu = (t * W) / 2;
    const mv = (t * H) / 2;
    bays.forEach((b, k) => {
      const panel = fullFaceRect(b.frame);
      const cols = [panel.u0, -W / 2 + mu, W / 2 - mu, panel.u1];
      const rows = [panel.v0, -H / 2 + mv, H / 2 - mv, panel.v1];
      const glass: FaceRect[] = [];
      const solid: FaceRect[] = [];
      for (let c = 0; c < 3; c++) {
        for (let r = 0; r < 3; r++) {
          const rect = { u0: cols[c]!, u1: cols[c + 1]!, v0: rows[r]!, v1: rows[r + 1]! };
          if (rect.u1 - rect.u0 <= EPS || rect.v1 - rect.v0 <= EPS) continue;
          (f > 0 && masks[k]![c]![r] ? glass : solid).push(rect);
        }
      }
      out.set(b.face.id, { glass: mergeGrid(glass), solid: mergeGrid(solid) });
    });
  }
  return out;
}

/**
 * Layout of one face. `stretch` (from `stretchWindows` over the whole building) is this face's
 * part of its façade's Stretch window; when omitted, a Stretch face is treated as a façade of one bay.
 */
export function layoutFace<F extends ResolvedFace>(face: F, options: FaceLayoutOptions = {}, stretch?: StretchBay): FaceLayout<F> {
  const cell = options.cell ?? DEFAULT_CELL_SIZE;
  const facade = options.facade ?? exampleFacadeProvider;
  const wallT = options.wallThickness ?? DEFAULT_WALL_THICKNESS;
  const frame = frameFor(face.direction, faceCentre(face.cell, face.direction, cell), cell, wallT);
  const panel = fullFaceRect(frame);
  const solids: FaceRect[] = [];
  const facadeStrips: number[] = [];
  const internalStrips: number[] = [];
  const openings: FaceOpening[] = [];
  const opening = (kind: FaceOpeningKind, rect: FaceRect, edgeId: number | null = face.edgeId) => openings.push({ kind, rect, edgeId });
  /**
   * At the end of a corridor narrower than the cell (2026-11-20, owner): the end follows the ROOM's
   * own exterior-wall look, not the corridor's. Returns the corridor's span of the face and whether
   * the room is open-sided, after pushing what stands beside the span; null for any other face
   * (a full-width corridor too: unchanged).
   * - Enclosed room, open-sided corridor: the strips beside the span are outdoors, so they are its
   *   exterior façade wall (`facadeStrips`; no window: a strip is narrower than any window bay).
   * - Enclosed room, enclosed corridor (owner override): the strips are internal walls (`internalStrips`).
   * - Open-sided room: no wall strips and no door; the end is open like the room's other exterior
   *   sides, keeping only their bay-edge posts where the room has a roof to carry.
   */
  const corridorEnd = (): { span: FaceRect; openRoom: boolean } | null => {
    const w = face.corridorWidth;
    if (w === undefined || w >= cell.horizontal - EPS) return null;
    const span = { u0: -w / 2, u1: w / 2, v0: panel.v0, v1: panel.v1 };
    const key = styleKeyOf(face, options);
    const openRoom = options.walls?.(key) === 'open';
    const posts = openRoom && (options.roof?.(key) ?? 'flat') !== 'none';
    const half = cell.horizontal / 2;
    const p = OPENING_PROPORTIONS.postWidth;
    for (const strip of rectsAroundHole(panel, span)) {
      let part: FaceRect | null = strip;
      if (openRoom) {
        // Only the post at this strip's bay edge, clipped to the strip.
        const edge = strip.u1 <= 0 ? { u0: -half, u1: -half + p } : { u0: half - p, u1: half };
        const u0 = Math.max(strip.u0, edge.u0);
        const u1 = Math.min(strip.u1, edge.u1);
        part = posts && u1 - u0 > EPS ? { ...strip, u0, u1 } : null;
      }
      if (!part) continue;
      // Enclosed room AND enclosed corridor (owner override 2026-11-20): the strips are internal walls.
      (openRoom || face.outside ? facadeStrips : internalStrips).push(solids.push(part) - 1);
    }
    return { span, openRoom };
  };

  if (face.orientation === 'wall') {
    switch (face.condition) {
      case 'exterior': {
        if (options.walls?.(styleKeyOf(face, options)) === 'open') {
          // No exterior wall. With a roof above, a slim post at each bay edge carries it.
          if ((options.roof?.(styleKeyOf(face, options)) ?? 'flat') !== 'none') {
            const p = OPENING_PROPORTIONS.postWidth;
            const half = cell.horizontal / 2;
            solids.push({ u0: -half, u1: -half + p, v0: panel.v0, v1: panel.v1 }, { u0: half - p, u1: half, v0: panel.v0, v1: panel.v1 });
          }
          break;
        }
        if (options.windowLayout?.(styleKeyOf(face, options)) === 'stretch') {
          const part = stretch ?? stretchWindows([face], options).get(face.id);
          if (part) {
            solids.push(...part.solid);
            for (const g of part.glass) opening('window', g, null);
            break;
          }
        }
        const hole = windowRect(cell, facade(styleKeyOf(face, options)).windowFraction);
        if (hole === null) solids.push(panel);
        else {
          solids.push(...rectsAroundHole(panel, hole));
          opening('window', hole, null);
        }
        break;
      }
      case 'door': {
        // At the end of a corridor, the door is no wider than the corridor (2026-11-19). Beside a
        // corridor narrower than the cell the end follows the room's look (2026-11-20): enclosed =
        // façade strips, and only the door's frame within the corridor's span is the door wall;
        // open-sided = no door, an opening as wide as the corridor (see `corridorEnd`).
        const end = corridorEnd();
        if (end?.openRoom) {
          opening('open', end.span);
          break;
        }
        const hole = narrowTo(doorRect(cell), face.corridorWidth);
        solids.push(...rectsAroundHole(end?.span ?? panel, hole));
        opening('door', hole);
        break;
      }
      case 'open': {
        // No partition at all, except at the end of a corridor narrower than the cell: a
        // full-height opening as wide as the corridor, centred, with the room's façade strips
        // (enclosed room) or nothing but its posts (open-sided room) beside it.
        opening('open', corridorEnd()?.span ?? panel);
        break;
      }
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
        if (face.condition === 'exterior' && face.direction === '+z' && options.roof?.(styleKeyOf(face, options)) === 'pergola') {
          // Pergola: open slats running along v, evenly spaced across the bay.
          const n = OPENING_PROPORTIONS.pergolaSlats;
          const w = cell.horizontal * OPENING_PROPORTIONS.pergolaSlatFraction;
          const step = (panel.u1 - panel.u0 - w) / (n - 1);
          for (let k = 0; k < n; k++) {
            const u0 = panel.u0 + k * step;
            solids.push({ u0, u1: u0 + w, v0: panel.v0, v1: panel.v1 });
          }
          break;
        }
        // `exterior` (roof / underside) or `solid` separation between storeys.
        solids.push(panel);
    }
  }
  return {
    faceId: face.id,
    face,
    frame,
    solids,
    openings,
    ...(facadeStrips.length > 0 ? { facadeStrips } : {}),
    ...(internalStrips.length > 0 ? { internalStrips } : {}),
  };
}

/** Layout of every face, in input order. Pure and deterministic. */
export function layoutFaces<F extends ResolvedFace>(faces: readonly F[], options: FaceLayoutOptions = {}): FaceLayout<F>[] {
  const stretch = stretchWindows(faces, options);
  return faces.map((face) => layoutFace(face, options, stretch.get(face.id)));
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
