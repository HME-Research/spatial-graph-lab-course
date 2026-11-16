import { FACE_DIRECTIONS, FACE_DIRECTION_OFFSETS, gridKey, neighbourCell, type FaceDirection, type GridCoord } from '@core/spatial';
import { footprintCells, v1KindFor, type DesignDocumentV2, type RoomNode } from '@app/document/v2';
import type { EdgeResolution, RoomFace, SpatialResolution } from '@app/spatial';
import type { FaceCondition, ResolvedFace } from './contracts';
import { directionOrientation } from './resolve';

/**
 * Schema-v2 face resolution for MULTI-CELL rooms (03-building). Pure, grid space only.
 *
 * Every unit face of every room cell is considered once:
 * - a face between two cells of the SAME room is interior to the room → no element at all
 *   (no partitions inside a room, no intermediate slabs inside a room with size z > 1);
 * - a face between two different rooms is authored once, by the room whose id sorts first;
 * - a face whose neighbour cell is empty is `exterior`;
 * - a face whose neighbour cell is reserved by a generated connector is either the connector's
 *   endpoint face (`door` for access, `open` for open, selecting the edge) or a plain `solid`
 *   boundary (no window, no roof) when the connector merely runs alongside / above / below.
 *
 * Occupancy comes ONLY from `spatial.occupancy` (02's single occupancy API); this module never
 * reserves or computes cells of its own. Shared-face portions are handled naturally because the
 * unit is one cell face: rooms with different extents share exactly the faces they touch.
 *
 * Direct relationships keep the v1 face conditions (`v1KindFor`): door / open / atrium /
 * vertical-access. To give ONE opening per relationship, an `access` edge (door or slab
 * opening) opens a single representative unit face — the lowest storey, then the middle of the
 * deterministic shared-face order; its other shared faces are solid. `open` removes the wall
 * (or voids the slab) on every shared unit face.
 */

/** How a face's condition was decided. */
export type FaceVia = 'none' | 'direct' | 'route';

export interface BuildingFace extends ResolvedFace {
  /** `direct` = shared with a related room; `route` = touches a generated connector cell. */
  readonly via: FaceVia;
}

/**
 * Face id: `${nodeId}:${dir}` for a single-cell room (identical to the v1 resolver, so a
 * migrated v1 document produces the same ids), otherwise `${nodeId}:${dx}.${dy}.${dz}:${dir}`
 * with the cell offset from the room's minimum corner. Node ids never contain ':'.
 */
export function buildingFaceId(node: Pick<RoomNode, 'id' | 'grid' | 'size'>, cell: GridCoord, direction: FaceDirection): string {
  const single = node.size[0] === 1 && node.size[1] === 1 && node.size[2] === 1;
  if (single) return `${node.id}:${direction}`;
  return `${node.id}:${cell[0] - node.grid[0]}.${cell[1] - node.grid[1]}.${cell[2] - node.grid[2]}:${direction}`;
}

/** Side-independent key of the unit face between `cell` and its neighbour in `direction`. */
export function unitFaceKey(cell: GridCoord, direction: FaceDirection): string {
  const o = FACE_DIRECTION_OFFSETS[direction];
  const negative = o[0] + o[1] + o[2] < 0;
  const base = negative ? neighbourCell(cell, direction) : cell;
  const axis = o[0] !== 0 ? 'x' : o[1] !== 0 ? 'y' : 'z';
  return `${gridKey(base)}|${axis}`;
}

interface DirectFace {
  readonly edgeId: string;
  readonly condition: FaceCondition;
}

/** Index of the representative unit face for a single opening: lowest storey, then middle. */
export function representativeFaceIndex(faces: readonly { readonly cell: GridCoord }[]): number {
  if (faces.length === 0) return -1;
  const lowest = Math.min(...faces.map((f) => f.cell[2]));
  const onLowest = faces.map((f, i) => [f, i] as const).filter(([f]) => f.cell[2] === lowest);
  return onLowest[Math.floor((onLowest.length - 1) / 2)]![1];
}

/** Unit-face conditions imposed by direct relationships, keyed by `unitFaceKey`. */
function directFaceConditions(resolutions: readonly EdgeResolution[]): Map<string, DirectFace> {
  const out = new Map<string, DirectFace>();
  for (const r of resolutions) {
    if (r.status !== 'direct') continue;
    const kind = v1KindFor(r.kind, r.contact);
    if (kind === null) continue;
    if (r.kind === 'access') {
      // Gate F: the student's preferred face (resolveWithPreferences), else the representative one.
      const f = r.preferredFace ?? r.faces[representativeFaceIndex(r.faces)];
      if (f) out.set(unitFaceKey(f.cell, f.direction), { edgeId: r.edgeId, condition: kind });
    } else {
      for (const f of r.faces) out.set(unitFaceKey(f.cell, f.direction), { edgeId: r.edgeId, condition: kind });
    }
  }
  return out;
}

/** Endpoint faces of generated connectors, keyed by `unitFaceKey`. */
function routeEndpointFaces(resolutions: readonly EdgeResolution[]): Map<string, DirectFace> {
  const out = new Map<string, DirectFace>();
  const add = (face: RoomFace, edgeId: string, condition: FaceCondition) =>
    out.set(unitFaceKey(face.cell, face.direction), { edgeId, condition });
  for (const r of resolutions) {
    if (r.status !== 'routed') continue;
    const condition: FaceCondition = r.kind === 'access' ? 'door' : 'open';
    add(r.route.from, r.edgeId, condition);
    add(r.route.to, r.edgeId, condition);
  }
  return out;
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Every bounding face of every room of a VALIDATED v2 document, given its spatial resolution.
 * Sorted by owner id, then cell (z, y, x), then FACE_DIRECTIONS. Independent of array order.
 */
export function resolveBuildingFaces(doc: DesignDocumentV2, spatial: SpatialResolution): BuildingFace[] {
  const direct = directFaceConditions(spatial.edges);
  const endpoints = routeEndpointFaces(spatial.edges);
  const typeOf = new Map(doc.nodes.map((n) => [n.id, n.typeId]));
  const faces: BuildingFace[] = [];

  for (const node of [...doc.nodes].sort(byId)) {
    for (const cell of footprintCells(node)) {
      for (const direction of FACE_DIRECTIONS) {
        const occupant = spatial.occupancy.at(neighbourCell(cell, direction));
        if (occupant?.kind === 'room' && occupant.nodeId === node.id) continue; // interior of the room
        if (occupant?.kind === 'room' && !(node.id < occupant.nodeId)) continue; // neighbour authors it
        if (occupant?.kind === 'room' && !typeOf.has(occupant.nodeId)) {
          throw new Error(`occupancy names unknown room "${occupant.nodeId}"`);
        }

        const key = unitFaceKey(cell, direction);
        let condition: FaceCondition = 'exterior';
        let edgeId: string | null = null;
        let via: FaceVia = 'none';
        if (occupant?.kind === 'room') {
          const d = direct.get(key);
          condition = d?.condition ?? 'solid';
          edgeId = d?.edgeId ?? null;
          via = d ? 'direct' : 'none';
        } else if (occupant?.kind === 'route') {
          const e = endpoints.get(key);
          via = 'route';
          if (e && e.edgeId === occupant.edgeId) {
            condition = e.condition;
            edgeId = e.edgeId;
          } else {
            condition = 'solid';
          }
        }

        faces.push({
          id: buildingFaceId(node, cell, direction),
          ownerNodeId: node.id,
          ownerTypeId: node.typeId,
          cell,
          direction,
          orientation: directionOrientation(direction),
          neighbourNodeId: occupant?.kind === 'room' ? occupant.nodeId : null,
          edgeId,
          condition,
          via,
        });
      }
    }
  }
  return faces;
}

/** Strip the v2-only `via` field (for comparison with / feeding the v1 geometry step). */
export const toResolvedFace = ({ via: _via, ...face }: BuildingFace): ResolvedFace => face;
