import { wallAction, type BuildingFace, type WallAction } from '@app/building';
import { nodeLabel, type DesignDocumentV2, type RelationshipKind } from '@app/document';
import {
  facePreferenceFor,
  type DesignCommand,
  type FacePreference,
  type ResolutionStatus,
  type ScenarioCommand,
  type SpatialResolution,
} from '@app/spatial';
import { STATUS_PRESENTATION, unresolvedReasonText } from '../../presentation/vocabulary';
import { NO_SELECTION, selectEdge, selectNode, type Selection } from '@core/viewer/selection';

/**
 * Shared-wall interaction (wave 2, D) for the Building and Plan views. PURE: given a building face
 * id, the face list of the CURRENT design (`resolveBuildingFaces` / `BuildingModelV2.faces`), the
 * document and its preference-aware resolution, it says what the wall panel shows and which ONE
 * command each button sends. Eligibility is the root `wallAction` rule (shared wall between two
 * distinct rooms; exterior, slab, route and interior faces are never eligible).
 *
 * The panel state (which wall is open) is view-local UI state, not a Selection kind.
 */

export interface WallRoom {
  readonly id: number;
  /** Readable label (display id), never only the raw id. */
  readonly label: string;
  readonly typeId: string;
}

export type WallPanel =
  /** The face is not (or no longer) a shared wall between two rooms. */
  | { readonly kind: 'unavailable'; readonly faceId: string; readonly message: string }
  /** No relationship yet: Add relationship → Access (door on THIS wall) / Open. */
  | {
      readonly kind: 'add';
      readonly faceId: string;
      readonly rooms: readonly [WallRoom, WallRoom];
      readonly source: number;
      readonly target: number;
      /** The clicked face, as the preferred door location (`add-edge-at-face`). */
      readonly preference: FacePreference;
    }
  /** A relationship exists: change its kind or remove it; never a second edge. */
  | {
      readonly kind: 'existing';
      readonly faceId: string;
      readonly rooms: readonly [WallRoom, WallRoom];
      readonly edgeId: number;
      readonly relationshipKind: RelationshipKind;
      readonly status: ResolutionStatus;
      readonly statusLabel: string;
      /** Unresolved only: why nothing is built. */
      readonly reasonText?: string;
      /** Where the opening is: on this wall, on another shared wall, or nowhere (unresolved). */
      readonly opening: 'here' | 'elsewhere' | 'none';
      /** Access only, when the door is not on this wall: the preference that puts it here. */
      readonly moveDoorHere: FacePreference | null;
    };

const UNAVAILABLE_TEXT: Readonly<Record<Extract<WallAction, { kind: 'not-eligible' }>['reason'], string>> = {
  exterior: 'This is an exterior wall: only a wall shared by two rooms can carry a relationship.',
  slab: 'This is a floor or ceiling: choose a wall shared by two rooms.',
  route: 'This wall faces a generated connector, not another room.',
  interior: 'This boundary lies inside one room.',
  'unknown-face': 'This wall is no longer shared by two rooms.',
};

/** Index of a face list by id (one per design; reuse it for many lookups). */
export function faceIndex(faces: readonly BuildingFace[]): ReadonlyMap<string, BuildingFace> {
  return new Map(faces.map((f) => [f.id, f]));
}

/** The shared `wallAction` verdict for one face, without scanning the whole face list. */
export function wallActionOf(
  faceId: string,
  faces: ReadonlyMap<string, BuildingFace>,
  doc: DesignDocumentV2,
  spatial: SpatialResolution,
): WallAction {
  const face = faces.get(faceId);
  return wallAction(faceId, { faces: face ? [face] : [] }, doc, spatial);
}

/** Ids of every eligible wall face (hover / click targets in the Building view). */
export function eligibleWallFaces(faces: readonly BuildingFace[], doc: DesignDocumentV2, spatial: SpatialResolution): ReadonlySet<string> {
  const out = new Set<string>();
  for (const face of faces) {
    if (face.orientation !== 'wall' || face.neighbourNodeId === null) continue;
    if (wallAction(face.id, { faces: [face] }, doc, spatial).kind !== 'not-eligible') out.add(face.id);
  }
  return out;
}

function roomOf(doc: DesignDocumentV2, id: number): WallRoom {
  const n = doc.nodes.find((x) => x.id === id);
  return { id, label: n ? nodeLabel(n) : String(id), typeId: n?.typeId ?? '' };
}

/**
 * What clicking an eligible shared wall SELECTS (integration I2), besides opening the wall panel.
 * A wall whose rooms have a relationship selects that relationship (Properties shows it, the same
 * edge the panel describes); any other shared wall selects its owner room, exactly as a wall click
 * did before the wall panel existed (`faceSelectionTarget`), so the room editor stays available.
 * A non-eligible or unknown face selects nothing.
 */
export function wallClickSelection(faceId: string, faces: ReadonlyMap<string, BuildingFace>, action: WallAction): Selection {
  if (action.kind === 'existing') return selectEdge(action.edgeId);
  const face = faces.get(faceId);
  if (action.kind === 'not-eligible' || !face) return NO_SELECTION;
  return face.edgeId !== null ? selectEdge(face.edgeId) : selectNode(face.ownerNodeId);
}

/**
 * Selection after "Remove relationship" succeeded (integration I2): the removed edge must not stay
 * selected, and the wall is now unrelated, so it selects what a fresh click on it would: its owner room.
 */
export const selectionAfterRemove = (panel: Extract<WallPanel, { kind: 'existing' }>): Selection => selectNode(panel.rooms[0].id);

/** What the wall panel shows for `faceId` in the current design. */
export function wallPanelModel(
  faceId: string,
  faces: ReadonlyMap<string, BuildingFace>,
  doc: DesignDocumentV2,
  spatial: SpatialResolution,
): WallPanel {
  const action = wallActionOf(faceId, faces, doc, spatial);
  if (action.kind === 'not-eligible') return { kind: 'unavailable', faceId, message: UNAVAILABLE_TEXT[action.reason] };
  const face = faces.get(faceId)!;
  const rooms: readonly [WallRoom, WallRoom] = [roomOf(doc, face.ownerNodeId), roomOf(doc, face.neighbourNodeId!)];
  if (action.kind === 'add') {
    return { kind: 'add', faceId, rooms, source: action.source, target: action.target, preference: action.preference };
  }
  const resolution = spatial.byEdge.get(action.edgeId);
  const status: ResolutionStatus = resolution?.status ?? 'unresolved';
  const opening = face.edgeId === action.edgeId ? 'here' : status === 'unresolved' ? 'none' : 'elsewhere';
  const owner = doc.nodes.find((n) => n.id === face.ownerNodeId)!;
  return {
    kind: 'existing',
    faceId,
    rooms,
    edgeId: action.edgeId,
    relationshipKind: action.relationshipKind,
    status,
    statusLabel: STATUS_PRESENTATION[status].label,
    ...(resolution?.status === 'unresolved' && { reasonText: unresolvedReasonText(resolution.reason) }),
    opening,
    moveDoorHere: action.relationshipKind === 'access' && opening !== 'here' ? facePreferenceFor(owner, face.cell, face.direction) : null,
  };
}

/** A command for the scenario (preferences) or the design port. */
export type WallCommand =
  | { readonly port: 'scenario'; readonly command: ScenarioCommand }
  | { readonly port: 'design'; readonly command: DesignCommand };

/**
 * Add a relationship across the clicked wall. Access: the edge AND the clicked face as its
 * preferred door location, in ONE step (`add-edge-at-face`). Open: a plain `add-edge` (an open
 * relationship removes the whole shared boundary, so it has no preferred face).
 */
export function addRelationshipCommand(
  panel: Extract<WallPanel, { kind: 'add' }>,
  kind: RelationshipKind,
  doc: Pick<DesignDocumentV2, 'nextEdgeId'>,
): { readonly edgeId: number; readonly command: WallCommand } {
  // The new relationship gets the design's next edge id.
  const edgeId = doc.nextEdgeId;
  const edge = { source: panel.source, target: panel.target, kind };
  return kind === 'access'
    ? { edgeId, command: { port: 'scenario', command: { type: 'add-edge-at-face', edge, preference: panel.preference } } }
    : { edgeId, command: { port: 'design', command: { type: 'add-edge', edge } } };
}

/** Put the existing access relationship's door on the clicked wall (one step). */
export function moveDoorHereCommand(panel: Extract<WallPanel, { kind: 'existing' }>): WallCommand | null {
  return panel.moveDoorHere ? { port: 'scenario', command: { type: 'set-face-preference', edgeId: panel.edgeId, preference: panel.moveDoorHere } } : null;
}

export const changeKindCommand = (panel: Extract<WallPanel, { kind: 'existing' }>, kind: RelationshipKind): WallCommand => ({
  port: 'design',
  command: { type: 'change-edge-kind', edgeId: panel.edgeId, kind },
});

export const removeRelationshipCommand = (panel: Extract<WallPanel, { kind: 'existing' }>): WallCommand => ({
  port: 'design',
  command: { type: 'remove-edge', edgeId: panel.edgeId },
});
