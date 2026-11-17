import { gridKey, type GridCoord } from '@core/spatial';
import { DEFAULT_CELL_SIZE, spatialToThree, type CellSize } from '@core/viewer/coordinates';
import { levelRange, nodeLabel, type DesignDocumentV2, type RoomNode } from '@app/document/v2';
import type { SpatialResolution } from '@app/spatial';
import type { FacadeProvider } from './contracts';
import { buildingFacesV2 } from './buildingV2';
import { DEFAULT_WALL_THICKNESS, axisIndex, layoutFaces, type FaceLayout, type FaceOpeningKind, type FaceRect } from './faceLayout';
import type { BuildingFace } from './multicellFaces';

/**
 * Plan (workstream C): the architectural floor plan of ONE storey, cut horizontally at
 * `cutHeight` above that storey's floor. Pure; no React or Three.js.
 *
 * It draws nothing of its own invention: every wall part and opening is the horizontal section of
 * a Gate F `FaceLayout` (the same layout `buildArchitecture` turns into 3D boxes), so a door,
 * window or slab opening sits at exactly the same place in the Building and the Plan.
 *
 * Plan coordinates are metres in the Three.js ground plane: `x` = world X (grid +x to the right),
 * `y` = world Z (= −grid y · cell). With SVG's y axis pointing down, grid +y points UP on screen.
 *
 * - Walls: the solid parts of each wall face that the cut plane crosses, as rectangles of wall
 *   thickness centred on the face plane (the same box footprint as in 3D).
 * - Openings: door / open / window rects of wall faces that the cut plane crosses. Their width
 *   along the wall is the FaceLayout opening width.
 * - Slab marks: openings of the storey's FLOOR slab (`position: 'floor'`) and of its CEILING slab
 *   (`position: 'ceiling'`, drawn as "above" by convention).
 * - Rooms: every room that spans this storey (a multi-storey room appears on each storey).
 * - Route cells: generated connector cells on this storey (they select their relationship).
 *
 * Unresolved relationships build no face condition, so they never appear as openings.
 */

/** Axis-aligned rectangle in plan metres (`x0 < x1`, `y0 < y1`). */
export interface PlanRect {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

export interface PlanRoom {
  readonly nodeId: string;
  /** `displayId ?? id`. */
  readonly label: string;
  readonly typeId: string;
  readonly rect: PlanRect;
  /** First and last storey the room spans (inclusive). */
  readonly levels: readonly [number, number];
}

export interface PlanWall {
  /** `${faceId}:wall:${index}`. */
  readonly id: string;
  readonly faceId: string;
  readonly ownerNodeId: string;
  readonly neighbourNodeId: string | null;
  readonly edgeId: string | null;
  readonly condition: BuildingFace['condition'];
  readonly rect: PlanRect;
}

export type PlanOpeningKind = Extract<FaceOpeningKind, 'door' | 'open' | 'window'>;

export interface PlanOpening {
  /** `${faceId}:${kind}:${index}`. */
  readonly id: string;
  readonly faceId: string;
  readonly kind: PlanOpeningKind;
  readonly ownerNodeId: string;
  readonly neighbourNodeId: string | null;
  /** The relationship that made it; null for a façade window. */
  readonly edgeId: string | null;
  /** Width along the wall in metres (= FaceLayout opening `u1 − u0`). */
  readonly width: number;
  /** The opening's footprint: its width along the wall × the wall thickness. */
  readonly rect: PlanRect;
  /** Wall axis in plan: 'x' (wall runs along plan x) or 'y'. */
  readonly along: 'x' | 'y';
  /** Outward normal of the owner face in plan coordinates (unit, axis-aligned). */
  readonly normal: readonly [number, number];
}

export type PlanSlabKind = Extract<FaceOpeningKind, 'slab-void' | 'slab-opening' | 'access-marker'>;

export interface PlanSlabMark {
  /** `${faceId}:${kind}:${index}`. */
  readonly id: string;
  readonly faceId: string;
  readonly kind: PlanSlabKind;
  /** `floor` = in this storey's floor; `ceiling` = in the slab above (drawn as "above"). */
  readonly position: 'floor' | 'ceiling';
  readonly ownerNodeId: string;
  readonly neighbourNodeId: string | null;
  readonly edgeId: string | null;
  readonly rect: PlanRect;
}

export interface PlanRouteCell {
  readonly edgeId: string;
  readonly cell: GridCoord;
  readonly rect: PlanRect;
}

/**
 * A wall face of this storey between two different rooms (not via a connector): what the Plan
 * offers to `wallAction` on hover/click. `line` is the face's centre line across its full width.
 */
export interface PlanWallTarget {
  readonly faceId: string;
  readonly ownerNodeId: string;
  readonly neighbourNodeId: string;
  readonly edgeId: string | null;
  readonly condition: BuildingFace['condition'];
  readonly line: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };
}

export interface PlanModel {
  readonly level: number;
  /** Cut height above this storey's floor, in metres (clamped inside the storey). */
  readonly cutHeight: number;
  readonly rooms: readonly PlanRoom[];
  readonly walls: readonly PlanWall[];
  readonly openings: readonly PlanOpening[];
  readonly slabs: readonly PlanSlabMark[];
  readonly routeCells: readonly PlanRouteCell[];
  readonly wallTargets: readonly PlanWallTarget[];
  /** Bounds of everything drawn on this storey (null when it is empty). */
  readonly bounds: PlanRect | null;
}

/** What the Plan needs: face layouts (Gate F) and the rooms; optionally the connector cells. */
export interface PlanSource {
  readonly layouts: readonly FaceLayout<BuildingFace>[];
  readonly rooms: readonly Pick<RoomNode, 'id' | 'grid' | 'size' | 'typeId' | 'displayId'>[];
  readonly routeCells?: readonly { readonly cell: GridCoord; readonly edgeId: string }[];
}

export interface PlanOptions {
  readonly cell?: CellSize;
  readonly wallThickness?: number;
}

/** Conventional plan cut: 1.2 m above the floor (through doors and typical windows). */
export const DEFAULT_CUT_HEIGHT = 1.2;
const EPS = 1e-9;

export interface PlanSourceOptions extends PlanOptions {
  /** Project façade defaults, as passed to `buildBuildingV2`. */
  readonly facade?: FacadeProvider;
}

/**
 * The Plan source of a v2 document: the SAME faces and façade `buildBuildingV2` uses
 * (`buildingFacesV2`), laid out by `layoutFaces`, plus rooms and connector cells. `spatial` must
 * be the resolution of `doc` (`DesignPort.spatial`).
 */
export function planSourceV2(doc: DesignDocumentV2, spatial: SpatialResolution, options: PlanSourceOptions = {}): PlanSource {
  const { faces, facade, windowLayout, walls, roof } = buildingFacesV2(doc, spatial, options.facade);
  const layouts = layoutFaces(faces, {
    facade,
    windowLayout,
    walls,
    roof,
    ...(options.cell ? { cell: options.cell } : {}),
    ...(options.wallThickness !== undefined ? { wallThickness: options.wallThickness } : {}),
  });
  const routeCells: { cell: GridCoord; edgeId: string }[] = [];
  const seen = new Set<string>();
  for (const r of spatial.edges) {
    if (r.status !== 'routed') continue;
    for (const cell of r.route.cells) {
      const occupant = spatial.occupancy.at(cell);
      // Only cells actually reserved for this route (the same rule the Building's connectors use).
      if (occupant?.kind !== 'route' || occupant.edgeId !== r.edgeId || seen.has(gridKey(cell))) continue;
      seen.add(gridKey(cell));
      routeCells.push({ cell, edgeId: r.edgeId });
    }
  }
  return { layouts, rooms: doc.nodes, routeCells };
}

/** Storeys that have a room or a connector cell, ascending. Empty for an empty design. */
export function planLevels(source: Pick<PlanSource, 'rooms' | 'routeCells'>): number[] {
  const levels = new Set<number>();
  for (const room of source.rooms) {
    const [lo, hi] = levelRange(room);
    for (let z = lo; z <= hi; z++) levels.add(z);
  }
  for (const r of source.routeCells ?? []) levels.add(r.cell[2]);
  return [...levels].sort((a, b) => a - b);
}

const rectOf = (ax: number, bx: number, ay: number, by: number): PlanRect => ({
  x0: Math.min(ax, bx),
  x1: Math.max(ax, bx),
  y0: Math.min(ay, by),
  y1: Math.max(ay, by),
});

/** Plan rectangle of a grid box from `min` cell spanning `size` cells (x, y only). */
function boxRect(min: GridCoord, size: readonly [number, number], cell: CellSize): PlanRect {
  const a = spatialToThree([min[0] - 0.5, min[1] - 0.5, min[2]], cell);
  const b = spatialToThree([min[0] + size[0] - 0.5, min[1] + size[1] - 0.5, min[2]], cell);
  return rectOf(a[0], b[0], a[2], b[2]);
}

/** Plan axis (0 = x, 1 = y) of a horizontal world axis (0 = X, 2 = Z). */
const planAxis = (worldAxis: 0 | 1 | 2): 0 | 1 => (worldAxis === 0 ? 0 : 1);

/** Section of a wall-face rect: its extent along u × wall thickness across the face plane. */
function wallSection(layout: FaceLayout, rect: FaceRect, thickness: number): PlanRect {
  const { frame } = layout;
  const u = axisIndex(frame.u);
  const n = axisIndex(frame.normal);
  const a0 = frame.origin[u] + rect.u0;
  const a1 = frame.origin[u] + rect.u1;
  const b0 = frame.origin[n] - thickness / 2;
  const b1 = frame.origin[n] + thickness / 2;
  return planAxis(u) === 0 ? rectOf(a0, a1, b0, b1) : rectOf(b0, b1, a0, a1);
}

/** A slab-face rect in plan: u = world X, v = world Z. */
function slabRect(layout: FaceLayout, rect: FaceRect): PlanRect {
  const { origin } = layout.frame;
  return rectOf(origin[0] + rect.u0, origin[0] + rect.u1, origin[2] + rect.v0, origin[2] + rect.v1);
}

const crosses = (rect: FaceRect, v: number) => rect.v0 - EPS <= v && v < rect.v1 - EPS;

function union(rects: readonly PlanRect[]): PlanRect | null {
  if (rects.length === 0) return null;
  return {
    x0: Math.min(...rects.map((r) => r.x0)),
    x1: Math.max(...rects.map((r) => r.x1)),
    y0: Math.min(...rects.map((r) => r.y0)),
    y1: Math.max(...rects.map((r) => r.y1)),
  };
}

/**
 * Build the plan of storey `level`, cut at `cutHeight` metres above its floor (default 1.2 m,
 * clamped inside the storey). Pure and deterministic; output follows the layout order.
 */
export function buildPlan(source: PlanSource, level: number, cutHeight: number = DEFAULT_CUT_HEIGHT, options: PlanOptions = {}): PlanModel {
  const cell = options.cell ?? DEFAULT_CELL_SIZE;
  const wallT = options.wallThickness ?? DEFAULT_WALL_THICKNESS;
  const cut = Math.min(Math.max(Number.isFinite(cutHeight) ? cutHeight : DEFAULT_CUT_HEIGHT, EPS), cell.vertical - EPS);

  const rooms: PlanRoom[] = [];
  for (const room of source.rooms) {
    const levels = levelRange(room);
    if (level < levels[0] || level > levels[1]) continue;
    rooms.push({
      nodeId: room.id,
      label: nodeLabel(room),
      typeId: room.typeId,
      rect: boxRect(room.grid, [room.size[0], room.size[1]], cell),
      levels,
    });
  }

  const walls: PlanWall[] = [];
  const openings: PlanOpening[] = [];
  const slabs: PlanSlabMark[] = [];
  const wallTargets: PlanWallTarget[] = [];

  for (const layout of source.layouts) {
    const { face, frame } = layout;
    const z = face.cell[2];
    if (face.orientation === 'wall') {
      if (z !== level) continue;
      // Face-local v is measured from the storey's mid-height.
      const v = cut - frame.height / 2;
      layout.solids.forEach((r, i) => {
        if (!crosses(r, v)) return;
        walls.push({
          id: `${face.id}:wall:${i}`,
          faceId: face.id,
          ownerNodeId: face.ownerNodeId,
          neighbourNodeId: face.neighbourNodeId,
          edgeId: face.edgeId,
          condition: face.condition,
          rect: wallSection(layout, r, wallT),
        });
      });
      const u = axisIndex(frame.u);
      const n = axisIndex(frame.normal);
      const normal: [number, number] = [0, 0];
      normal[planAxis(n)] = frame.normal[n];
      layout.openings.forEach((o, i) => {
        if (o.kind !== 'door' && o.kind !== 'open' && o.kind !== 'window') return;
        if (!crosses(o.rect, v)) return;
        openings.push({
          id: `${face.id}:${o.kind}:${i}`,
          faceId: face.id,
          kind: o.kind,
          ownerNodeId: face.ownerNodeId,
          neighbourNodeId: face.neighbourNodeId,
          edgeId: o.edgeId,
          width: o.rect.u1 - o.rect.u0,
          rect: wallSection(layout, o.rect, wallT),
          along: planAxis(u) === 0 ? 'x' : 'y',
          normal,
        });
      });
      if (face.neighbourNodeId !== null && face.neighbourNodeId !== face.ownerNodeId && face.via !== 'route') {
        const a = frame.origin[u] - frame.width / 2;
        const b = frame.origin[u] + frame.width / 2;
        const c = frame.origin[n];
        wallTargets.push({
          faceId: face.id,
          ownerNodeId: face.ownerNodeId,
          neighbourNodeId: face.neighbourNodeId,
          edgeId: face.edgeId,
          condition: face.condition,
          line: planAxis(u) === 0 ? { x0: a, y0: c, x1: b, y1: c } : { x0: c, y0: a, x1: c, y1: b },
        });
      }
      continue;
    }
    // Slab plane of this face, in storeys: '+z' of cell z is the floor of z + 1.
    const floorOf = face.direction === '+z' ? z + 1 : z;
    const position = floorOf === level ? 'floor' : floorOf === level + 1 ? 'ceiling' : null;
    if (position === null) continue;
    layout.openings.forEach((o, i) => {
      if (o.kind !== 'slab-void' && o.kind !== 'slab-opening' && o.kind !== 'access-marker') return;
      slabs.push({
        id: `${face.id}:${o.kind}:${i}`,
        faceId: face.id,
        kind: o.kind,
        position,
        ownerNodeId: face.ownerNodeId,
        neighbourNodeId: face.neighbourNodeId,
        edgeId: o.edgeId,
        rect: slabRect(layout, o.rect),
      });
    });
  }

  const routeCells: PlanRouteCell[] = (source.routeCells ?? [])
    .filter((r) => r.cell[2] === level)
    .map((r) => ({ edgeId: r.edgeId, cell: r.cell, rect: boxRect(r.cell, [1, 1], cell) }));

  const bounds = union([...rooms.map((r) => r.rect), ...walls.map((w) => w.rect), ...routeCells.map((r) => r.rect)]);
  return { level, cutHeight: cut, rooms, walls, openings, slabs, routeCells, wallTargets, bounds };
}

/** Bounds of every storey's plan (a stable frame when switching storeys), or null. */
export function planBoundsAllLevels(source: PlanSource, options: PlanOptions = {}): PlanRect | null {
  const cell = options.cell ?? DEFAULT_CELL_SIZE;
  const wallT = options.wallThickness ?? DEFAULT_WALL_THICKNESS;
  const rects: PlanRect[] = source.rooms.map((r) => boxRect(r.grid, [r.size[0], r.size[1]], cell));
  for (const r of source.routeCells ?? []) rects.push(boxRect(r.cell, [1, 1], cell));
  const all = union(rects);
  if (!all) return null;
  // Walls straddle the room edge (and ±x walls run one thickness further to close corners).
  return { x0: all.x0 - wallT, x1: all.x1 + wallT, y0: all.y0 - wallT, y1: all.y1 + wallT };
}
