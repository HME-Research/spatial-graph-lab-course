import { DEFAULT_CELL_SIZE, type CellSize, type WorldPoint } from '@core/viewer/coordinates';
import { selectEdge, selectNode, type Selection } from '@core/viewer/selection';
import type { FaceCondition, FaceOrientation, FacadeProvider, ResolvedFace } from './contracts';
import {
  DEFAULT_SLAB_THICKNESS,
  DEFAULT_WALL_THICKNESS,
  OPENING_PROPORTIONS,
  axisIndex,
  faceRectBox,
  layoutFaces,
  type WindowLayoutProvider,
  type WallStyleProvider,
  type RoofStyleProvider,
} from './faceLayout';

// Re-exported for existing callers; the definitions now live in faceLayout.ts (Gate F, F-C).
export {
  DEFAULT_SLAB_THICKNESS,
  DEFAULT_WALL_THICKNESS,
  OPENING_PROPORTIONS,
  faceCentre,
  openingArea,
  rectsAroundHole,
} from './faceLayout';

/**
 * Pure geometry step: ResolvedFace[] → plain axis-aligned boxes in Three.js world space.
 * No Three.js import; positions come only from spatialToThree. Simple boxes, no CSG:
 * an opening is a panel split into up to four boxes around a hole. Which parts of a face are
 * solid and where the openings are is decided once, by `layoutFaces` (faceLayout.ts).
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
  | 'threshold';

export interface ArchitecturalElement {
  /** Unique and deterministic: `${faceId}:${part}:${index}`. */
  readonly id: string;
  readonly faceId: string;
  readonly part: ElementPart;
  readonly condition: FaceCondition;
  /** Copied from the face: an open-air connector's end wall (façade colour, glass door). */
  readonly outside?: true;
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
  /** Window placement per node type (see `FaceLayoutOptions.windowLayout`). */
  readonly windowLayout?: WindowLayoutProvider;
  /** Open-sided types (see `FaceLayoutOptions.walls`). */
  readonly walls?: WallStyleProvider;
  /** Roof per type, for pergola slats (see `FaceLayoutOptions.roof`). */
  readonly roof?: RoofStyleProvider;
  readonly wallThickness?: number;
  readonly slabThickness?: number;
}

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

/** Build world-space boxes for resolved faces. Pure and deterministic; output follows face order. */
export function buildArchitecture(faces: readonly ResolvedFace[], options: ArchitectureOptions = {}): ArchitecturalElement[] {
  const cell: CellSize = options.cell ?? DEFAULT_CELL_SIZE;
  const wallT = options.wallThickness ?? DEFAULT_WALL_THICKNESS;
  const slabT = options.slabThickness ?? DEFAULT_SLAB_THICKNESS;
  const out: ArchitecturalElement[] = [];

  for (const layout of layoutFaces(faces, options)) {
    const { face, frame } = layout;
    const centre = frame.origin;
    const target = faceSelectionTarget(face);
    let index = 0;
    const emit = (part: ElementPart, geometry: { position: WorldPoint; size: WorldPoint }) => {
      out.push({
        id: `${face.id}:${part}:${index++}`,
        faceId: face.id,
        part,
        condition: face.condition,
        ...(face.outside ? { outside: true as const } : {}),
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

    if (face.orientation === 'wall') {
      for (const r of layout.solids) emit('wall', faceRectBox(frame, r, wallT));
      for (const opening of layout.openings) {
        if (opening.kind === 'window') emit('glazing', faceRectBox(frame, opening.rect, wallT * 0.3));
        else if (opening.kind === 'open') {
          // No partition. A flat floor strip keeps the relationship pickable (the Building draws it invisibly unless hovered or selected).
          const u = axisIndex(frame.u);
          const n = axisIndex(frame.normal);
          const floorTop = centre[1] - cell.vertical / 2 + slabT / 2;
          const position = [...centre] as [number, number, number];
          position[1] = floorTop + 0.01;
          const size = [0, 0, 0] as [number, number, number];
          size[u] = cell.horizontal * 0.9;
          size[n] = cell.horizontal * OPENING_PROPORTIONS.thresholdDepthFraction;
          size[1] = 0.02;
          emit('threshold', { position, size });
        }
        // An outside door (end of an open-air connector) is a closed glass door filling the hole.
        else if (opening.kind === 'door' && face.outside) emit('glazing', faceRectBox(frame, opening.rect, wallT * 0.3));
        // Any other door is the hole between the solid frame parts: nothing else to draw.
      }
      continue;
    }

    // Slabs: an exposed top is a roof; every other slab part (including openings' frames) is a slab.
    const solidPart: ElementPart = face.condition === 'exterior' && face.direction === '+z' ? 'roof' : 'slab';
    // A vertical-access slab is only its opening (the frame around it): no vertical marker box in
    // the Building (owner 2026-11-17). The Plan still draws its `access-marker` symbol.
    for (const r of layout.solids) emit(solidPart, faceRectBox(frame, r, slabT));
  }
  return out;
}

/** World-space bounds of a set of elements, or null when empty. For camera framing. */
export function elementBounds(elements: readonly Pick<ArchitecturalElement, 'position' | 'size'>[]): { min: WorldPoint; max: WorldPoint; centre: WorldPoint; radius: number } | null {
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
