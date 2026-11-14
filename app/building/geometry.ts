import type { GridCoord } from '@app/document';
import { DEFAULT_CELL_SIZE, spatialToThree, type CellSize, type WorldPoint } from '@core/viewer/coordinates';
import { selectEdge, selectNode, type Selection } from '@core/viewer/selection';
import {
  FACE_DIRECTION_OFFSETS,
  type FaceCondition,
  type FaceDirection,
  type FaceOrientation,
  type FacadeProvider,
  type ResolvedFace,
} from './contracts';
import { clampWindowFraction, exampleFacadeProvider } from './facade';

/**
 * Pure geometry step: ResolvedFace[] → plain axis-aligned boxes in Three.js world space.
 * No Three.js import; positions come only from spatialToThree. Simple boxes, no CSG:
 * an opening is a panel split into up to four boxes around a hole.
 */

export type ElementPart =
  /** Opaque wall panel (exterior façade, internal partition, or the frame around a doorway). */
  | 'wall'
  /** Thin glazing pane filling a façade window opening. */
  | 'glazing'
  /** Floor / internal slab panel (possibly the frame around a slab opening). */
  | 'slab'
  /** Exterior top face. The view is open-top by default and hides these. */
  | 'roof'
  /** Flat floor strip marking an `open` boundary that has no wall. */
  | 'threshold'
  /** Abstract vertical marker for `vertical-access`. Symbolic only: not a staircase. */
  | 'circulation-marker';

export interface ArchitecturalElement {
  /** Unique and deterministic: `${faceId}:${part}:${index}`. */
  readonly id: string;
  readonly faceId: string;
  readonly part: ElementPart;
  readonly condition: FaceCondition;
  readonly orientation: FaceOrientation;
  readonly ownerNodeId: string;
  readonly ownerTypeId: string;
  readonly neighbourNodeId: string | null;
  readonly edgeId: string | null;
  /** What picking this element selects: its edge if it has one, otherwise its owner node. */
  readonly target: Selection;
  /** Box centre in Three.js world space. */
  readonly position: WorldPoint;
  /** Box extents along Three.js X, Y, Z. */
  readonly size: WorldPoint;
}

export interface ArchitectureOptions {
  readonly cell?: CellSize;
  readonly facade?: FacadeProvider;
  readonly wallThickness?: number;
  readonly slabThickness?: number;
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

export const faceSelectionTarget = (face: ResolvedFace): Selection =>
  face.edgeId !== null ? selectEdge(face.edgeId) : selectNode(face.ownerNodeId);

/**
 * Highlight rule: an edge selection lights the faces of that edge; a node selection lights
 * every face bounding that node's cell, whichever node authored the face.
 */
export function isElementHighlighted(element: ArchitecturalElement, selection: Selection): boolean {
  switch (selection.kind) {
    case 'none':
      return false;
    case 'edge':
      return element.edgeId === selection.id;
    case 'node':
      return element.ownerNodeId === selection.id || element.neighbourNodeId === selection.id;
  }
}

/** Grid-space face centre = cell + offset / 2, mapped to world space. */
export function faceCentre(cell: GridCoord, direction: FaceDirection, size: CellSize = DEFAULT_CELL_SIZE): WorldPoint {
  const o = FACE_DIRECTION_OFFSETS[direction];
  return spatialToThree([cell[0] + o[0] / 2, cell[1] + o[1] / 2, cell[2] + o[2] / 2], size);
}

/** Rectangle in a face's local (u, v) plane, centred on the face centre. */
interface Rect {
  readonly u0: number;
  readonly u1: number;
  readonly v0: number;
  readonly v1: number;
}

/** World axis indices (0 = X, 1 = Y, 2 = Z) of a face's normal and in-plane axes. */
interface Frame {
  readonly n: 0 | 1 | 2;
  readonly u: 0 | 1 | 2;
  readonly v: 0 | 1 | 2;
  /** Panel extents along u and v. */
  readonly uLen: number;
  readonly vLen: number;
}

function frameFor(direction: FaceDirection, cell: CellSize, wallThickness: number): Frame {
  const W = cell.horizontal;
  const H = cell.vertical;
  switch (direction) {
    case '+x':
    case '-x':
      // ±x walls run along Z and are extended by one wall thickness so outer corners close.
      return { n: 0, u: 2, v: 1, uLen: W + wallThickness, vLen: H };
    case '+y':
    case '-y':
      return { n: 2, u: 0, v: 1, uLen: W, vLen: H };
    case '+z':
    case '-z':
      return { n: 1, u: 0, v: 2, uLen: W, vLen: W };
  }
}

function box(centre: WorldPoint, frame: Frame, rect: Rect, thickness: number): { position: WorldPoint; size: WorldPoint } {
  const position = [...centre] as [number, number, number];
  position[frame.u] += (rect.u0 + rect.u1) / 2;
  position[frame.v] += (rect.v0 + rect.v1) / 2;
  const size = [0, 0, 0] as [number, number, number];
  size[frame.n] = thickness;
  size[frame.u] = rect.u1 - rect.u0;
  size[frame.v] = rect.v1 - rect.v0;
  return { position, size };
}

const fullRect = (f: Frame): Rect => ({ u0: -f.uLen / 2, u1: f.uLen / 2, v0: -f.vLen / 2, v1: f.vLen / 2 });

/** Split a panel into up to four rectangles surrounding `hole` (no CSG). */
export function rectsAroundHole(panel: Rect, hole: Rect): Rect[] {
  const h = {
    u0: Math.max(panel.u0, hole.u0),
    u1: Math.min(panel.u1, hole.u1),
    v0: Math.max(panel.v0, hole.v0),
    v1: Math.min(panel.v1, hole.v1),
  };
  if (h.u1 - h.u0 <= EPS || h.v1 - h.v0 <= EPS) return [panel];
  const parts: Rect[] = [
    { u0: panel.u0, u1: h.u0, v0: panel.v0, v1: panel.v1 },
    { u0: h.u1, u1: panel.u1, v0: panel.v0, v1: panel.v1 },
    { u0: h.u0, u1: h.u1, v0: panel.v0, v1: h.v0 },
    { u0: h.u0, u1: h.u1, v0: h.v1, v1: panel.v1 },
  ];
  return parts.filter((r) => r.u1 - r.u0 > EPS && r.v1 - r.v0 > EPS);
}

/** Centred window whose area is `fraction` of the cell's wall area (same proportions as the wall). */
function windowRect(cell: CellSize, fraction: number): Rect | null {
  const f = clampWindowFraction(fraction);
  if (f <= 0) return null;
  const s = Math.sqrt(f);
  const w = (cell.horizontal * s) / 2;
  const h = (cell.vertical * s) / 2;
  return { u0: -w, u1: w, v0: -h, v1: h };
}

function doorRect(cell: CellSize): Rect {
  const p = OPENING_PROPORTIONS;
  const w = Math.min(p.doorWidth, cell.horizontal * p.doorWidthMaxFraction) / 2;
  const h = Math.min(p.doorHeight, cell.vertical * p.doorHeightMaxFraction);
  const floor = -cell.vertical / 2;
  return { u0: -w, u1: w, v0: floor, v1: floor + h };
}

function atriumRect(cell: CellSize): Rect {
  const a = (cell.horizontal * OPENING_PROPORTIONS.atriumFraction) / 2;
  return { u0: -a, u1: a, v0: -a, v1: a };
}

/** Off-centre toward world +X, so it is identical whichever storey authors the slab. */
function accessRect(cell: CellSize): Rect {
  const p = OPENING_PROPORTIONS;
  const W = cell.horizontal;
  const cu = W * p.accessOffsetFraction;
  const hw = (W * p.accessWidthFraction) / 2;
  const hd = (W * p.accessDepthFraction) / 2;
  return { u0: cu - hw, u1: cu + hw, v0: -hd, v1: hd };
}

/** Area of a slab or wall opening for a condition, in m² (0 when there is none). Useful for tests/UI. */
export function openingArea(condition: FaceCondition, orientation: FaceOrientation, cell: CellSize = DEFAULT_CELL_SIZE): number {
  const area = (r: Rect) => (r.u1 - r.u0) * (r.v1 - r.v0);
  if (orientation === 'slab') {
    if (condition === 'atrium') return area(atriumRect(cell));
    if (condition === 'vertical-access') return area(accessRect(cell));
    return 0;
  }
  if (condition === 'door') return area(doorRect(cell));
  if (condition === 'open') return cell.horizontal * cell.vertical;
  return 0;
}

/** Build world-space boxes for resolved faces. Pure and deterministic; output follows face order. */
export function buildArchitecture(faces: readonly ResolvedFace[], options: ArchitectureOptions = {}): ArchitecturalElement[] {
  const cell = options.cell ?? DEFAULT_CELL_SIZE;
  const facade = options.facade ?? exampleFacadeProvider;
  const wallT = options.wallThickness ?? DEFAULT_WALL_THICKNESS;
  const slabT = options.slabThickness ?? DEFAULT_SLAB_THICKNESS;
  const out: ArchitecturalElement[] = [];

  for (const face of faces) {
    const centre = faceCentre(face.cell, face.direction, cell);
    const frame = frameFor(face.direction, cell, wallT);
    const target = faceSelectionTarget(face);
    let index = 0;
    const emit = (part: ElementPart, geometry: { position: WorldPoint; size: WorldPoint }) => {
      out.push({
        id: `${face.id}:${part}:${index++}`,
        faceId: face.id,
        part,
        condition: face.condition,
        orientation: face.orientation,
        ownerNodeId: face.ownerNodeId,
        ownerTypeId: face.ownerTypeId,
        neighbourNodeId: face.neighbourNodeId,
        edgeId: face.edgeId,
        target,
        position: geometry.position,
        size: geometry.size,
      });
    };
    const panel = fullRect(frame);

    if (face.orientation === 'wall') {
      switch (face.condition) {
        case 'exterior': {
          const hole = windowRect(cell, facade(face.ownerTypeId).windowFraction);
          if (hole === null) {
            emit('wall', box(centre, frame, panel, wallT));
          } else {
            for (const r of rectsAroundHole(panel, hole)) emit('wall', box(centre, frame, r, wallT));
            emit('glazing', box(centre, frame, hole, wallT * 0.3));
          }
          break;
        }
        case 'door':
          for (const r of rectsAroundHole(panel, doorRect(cell))) emit('wall', box(centre, frame, r, wallT));
          break;
        case 'open': {
          // No partition. A flat floor strip keeps the relationship visible and pickable.
          const floorTop = centre[1] - cell.vertical / 2 + slabT / 2;
          const position = [...centre] as [number, number, number];
          position[1] = floorTop + 0.01;
          const size = [0, 0, 0] as [number, number, number];
          size[frame.u] = cell.horizontal * 0.9;
          size[frame.n] = cell.horizontal * OPENING_PROPORTIONS.thresholdDepthFraction;
          size[1] = 0.02;
          emit('threshold', { position, size });
          break;
        }
        default:
          // `solid` internal partition (vertical kinds cannot occur on a wall in a valid document).
          emit('wall', box(centre, frame, panel, wallT));
      }
      continue;
    }

    // Slabs.
    switch (face.condition) {
      case 'exterior':
        emit(face.direction === '+z' ? 'roof' : 'slab', box(centre, frame, panel, slabT));
        break;
      case 'atrium':
        for (const r of rectsAroundHole(panel, atriumRect(cell))) emit('slab', box(centre, frame, r, slabT));
        break;
      case 'vertical-access': {
        const hole = accessRect(cell);
        for (const r of rectsAroundHole(panel, hole)) emit('slab', box(centre, frame, r, slabT));
        const m = OPENING_PROPORTIONS.markerWidth;
        const marker = box(centre, frame, { u0: (hole.u0 + hole.u1) / 2 - m / 2, u1: (hole.u0 + hole.u1) / 2 + m / 2, v0: -m / 2, v1: m / 2 }, cell.vertical);
        emit('circulation-marker', marker);
        break;
      }
      default:
        // `solid` separation between storeys (horizontal kinds cannot occur on a slab in a valid document).
        emit('slab', box(centre, frame, panel, slabT));
    }
  }
  return out;
}

/** World-space bounds of a set of elements, or null when empty. For camera framing. */
export function elementBounds(elements: readonly ArchitecturalElement[]): { min: WorldPoint; max: WorldPoint; centre: WorldPoint; radius: number } | null {
  if (elements.length === 0) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const e of elements) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i]!, e.position[i]! - e.size[i]! / 2);
      max[i] = Math.max(max[i]!, e.position[i]! + e.size[i]! / 2);
    }
  }
  const centre = [0, 1, 2].map((i) => (min[i]! + max[i]!) / 2) as [number, number, number];
  const radius = Math.hypot(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!) / 2;
  return { min: min as [number, number, number], max: max as [number, number, number], centre, radius };
}
