import { FACE_DIRECTIONS, neighbourCell, type FaceDirection, type GridCoord } from '@core/spatial';
import { footprintContains, type DesignDocumentV2, type RelationshipKind } from '@app/document';
import { facePreferenceFor, type FacePreference, type SpatialResolution } from '@app/spatial';
import type { BuildingFace } from './multicellFaces';

/**
 * What clicking a wall face may do (Gate F, F-C). Pure; shared by the Building and Plan views.
 *
 * Eligible = a horizontal (wall) face between two DIFFERENT rooms (`neighbourNodeId` set) that is
 * not a connector boundary (`via !== 'route'`). On an eligible face:
 * - `existing`: the two rooms already have a relationship;
 * - `add`: no relationship yet; the host may issue `add-edge-at-face` with `source`, `target` and
 *   `preference` (measured from the source = the face's owner room).
 */
export type WallAction =
  | { readonly kind: 'not-eligible'; readonly reason: 'exterior' | 'slab' | 'route' | 'interior' | 'unknown-face' }
  | { readonly kind: 'add'; readonly source: string; readonly target: string; readonly preference: FacePreference }
  | { readonly kind: 'existing'; readonly edgeId: string; readonly relationshipKind: RelationshipKind };

/** Parse a building face id (`buildingFaceId`): `${nodeId}:${dir}` or `${nodeId}:${dx}.${dy}.${dz}:${dir}`. */
function parseFaceId(faceId: string): { nodeId: string; offset: GridCoord; direction: FaceDirection } | null {
  const parts = faceId.split(':');
  const direction = parts[parts.length - 1] as FaceDirection;
  if (!FACE_DIRECTIONS.includes(direction)) return null;
  if (parts.length === 2) return { nodeId: parts[0]!, offset: [0, 0, 0], direction };
  if (parts.length !== 3) return null;
  const offset = parts[1]!.split('.').map(Number);
  if (offset.length !== 3 || !offset.every((n) => Number.isInteger(n))) return null;
  return { nodeId: parts[0]!, offset: offset as unknown as GridCoord, direction };
}

export function wallAction(
  faceId: string,
  model: { readonly faces: readonly BuildingFace[] },
  doc: DesignDocumentV2,
  spatial: SpatialResolution,
): WallAction {
  const face = model.faces.find((f) => f.id === faceId);
  if (!face) {
    // A face between two cells of the same room has no element and is not in the model.
    const parsed = parseFaceId(faceId);
    const room = parsed ? doc.nodes.find((n) => n.id === parsed.nodeId) : undefined;
    if (parsed && room) {
      const cell: GridCoord = [room.grid[0] + parsed.offset[0], room.grid[1] + parsed.offset[1], room.grid[2] + parsed.offset[2]];
      if (footprintContains(room, cell) && footprintContains(room, neighbourCell(cell, parsed.direction))) {
        return { kind: 'not-eligible', reason: 'interior' };
      }
    }
    return { kind: 'not-eligible', reason: 'unknown-face' };
  }
  if (face.orientation === 'slab') return { kind: 'not-eligible', reason: 'slab' };
  if (face.via === 'route') return { kind: 'not-eligible', reason: 'route' };
  const neighbourId = face.neighbourNodeId;
  if (neighbourId === null) return { kind: 'not-eligible', reason: 'exterior' };
  if (neighbourId === face.ownerNodeId) return { kind: 'not-eligible', reason: 'interior' };

  // The model must describe the current document: the neighbour still occupies the cell across.
  const across = spatial.occupancy.at(neighbourCell(face.cell, face.direction));
  const owner = doc.nodes.find((n) => n.id === face.ownerNodeId);
  if (!owner || across?.kind !== 'room' || across.nodeId !== neighbourId) return { kind: 'not-eligible', reason: 'unknown-face' };

  const edge =
    (face.edgeId !== null ? doc.edges.find((e) => e.id === face.edgeId) : undefined) ??
    doc.edges.find(
      (e) => (e.source === face.ownerNodeId && e.target === neighbourId) || (e.source === neighbourId && e.target === face.ownerNodeId),
    );
  if (edge) return { kind: 'existing', edgeId: edge.id, relationshipKind: edge.kind };
  return {
    kind: 'add',
    source: face.ownerNodeId,
    target: neighbourId,
    preference: facePreferenceFor(owner, face.cell, face.direction),
  };
}
