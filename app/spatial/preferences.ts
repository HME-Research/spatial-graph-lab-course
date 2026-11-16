import { z } from 'zod';
import { FACE_DIRECTIONS, FACE_DIRECTION_OFFSETS, neighbourCell, type FaceDirection, type GridCoord } from '@core/spatial';
import { idSchema } from '@app/document';
import { footprintContains, type DesignDocumentV2, type RelationshipEdge, type SharedFace } from '@app/document/v2';
import type { EdgeResolution, SpatialResolution } from './contracts';
import { resolveRelationships } from './resolve';

/**
 * Preferred face (Gate F, F-C): which shared wall (or floor) an `access` relationship opens on.
 * Only `access` relationships carry one (an `open` relationship removes the whole shared boundary).
 *
 * A SCENARIO SIDECAR, not part of the design document (schema v2 is strict and frozen). The
 * preference is room-relative: a cell offset from one endpoint room's minimum corner plus an
 * outward direction. It therefore survives moving both rooms together, and moving the other room
 * while that face is still shared. When the face is no longer shared, the relationship is kept but
 * becomes `unresolved` / `preferred-face-unavailable`: the opening is never moved elsewhere.
 */

export interface FacePreference {
  /** The edge's source or target room the offset is measured from. */
  readonly nodeId: string;
  /** Cell offset from that room's minimum corner (`grid`). */
  readonly offset: readonly [number, number, number];
  /** Outward from that cell, towards the other room. */
  readonly direction: FaceDirection;
}

/** Keyed by edge id. */
export type FacePreferences = Readonly<Record<string, FacePreference>>;

/**
 * Offsets may be negative or beyond the room's size: a resize keeps a preferred face at its
 * ABSOLUTE cell (see `rebasePreferences`), which can leave it outside the resized room. Such a
 * stale preference must survive saving and loading so the edge stays visibly unresolved
 * (`preferred-face-unavailable`); `set-face-preference` still refuses a face outside the room.
 */
const offsetIntSchema = z.int({ error: 'offset values must be integers' });

export const facePreferenceSchema = z.strictObject({
  nodeId: idSchema,
  offset: z.tuple([offsetIntSchema, offsetIntSchema, offsetIntSchema], { error: 'offset must be three integers [dx, dy, dz]' }),
  direction: z.enum(FACE_DIRECTIONS),
});

export const facePreferencesSchema = z.record(idSchema, facePreferenceSchema);

export const EMPTY_FACE_PREFERENCES: FacePreferences = Object.freeze({});

export type FacePreferenceCheck =
  | { readonly ok: true; readonly face: SharedFace }
  | { readonly ok: false; readonly reason: 'not-endpoint' | 'outside-room' | 'not-shared' };

const OPPOSITE: Readonly<Record<FaceDirection, FaceDirection>> = {
  '+x': '-x',
  '-x': '+x',
  '+y': '-y',
  '-y': '+y',
  '+z': '-z',
  '-z': '+z',
};

/** The preference expressed as a face of `room` (its absolute cell and direction). */
export function preferenceCell(room: { readonly grid: GridCoord }, preference: FacePreference): GridCoord {
  return [room.grid[0] + preference.offset[0], room.grid[1] + preference.offset[1], room.grid[2] + preference.offset[2]];
}

/** The preference for a face of `room` given as an absolute cell + direction. */
export function facePreferenceFor(room: { readonly id: string; readonly grid: GridCoord }, cell: GridCoord, direction: FaceDirection): FacePreference {
  return { nodeId: room.id, offset: [cell[0] - room.grid[0], cell[1] - room.grid[1], cell[2] - room.grid[2]], direction };
}

/**
 * Is `preference` a face currently shared by the two rooms of `edge`? On success, the face is
 * given from the edge's SOURCE room (the convention of `EdgeResolution.faces`).
 */
export function checkFacePreference(
  doc: Pick<DesignDocumentV2, 'nodes'>,
  edge: Pick<RelationshipEdge, 'source' | 'target'>,
  preference: FacePreference,
): FacePreferenceCheck {
  if (preference.nodeId !== edge.source && preference.nodeId !== edge.target) return { ok: false, reason: 'not-endpoint' };
  const otherId = preference.nodeId === edge.source ? edge.target : edge.source;
  const room = doc.nodes.find((n) => n.id === preference.nodeId);
  const other = doc.nodes.find((n) => n.id === otherId);
  if (!room) return { ok: false, reason: 'not-endpoint' };
  if (!(preference.direction in FACE_DIRECTION_OFFSETS)) return { ok: false, reason: 'not-shared' };
  const cell = preferenceCell(room, preference);
  if (!footprintContains(room, cell)) return { ok: false, reason: 'outside-room' };
  const across = neighbourCell(cell, preference.direction);
  if (!other || !footprintContains(other, across)) return { ok: false, reason: 'not-shared' };
  const face: SharedFace =
    preference.nodeId === edge.source ? { cell, direction: preference.direction } : { cell: across, direction: OPPOSITE[preference.direction] };
  return { ok: true, face };
}

const NOT_AVAILABLE_TEXT: Readonly<Record<'not-endpoint' | 'outside-room' | 'not-shared', string>> = {
  'not-endpoint': 'names a room that is not one of its two rooms',
  'outside-room': 'is no longer inside the room (it was resized)',
  'not-shared': 'is no longer shared by the two rooms',
};

const sameTriple = (a: readonly number[], b: readonly number[]) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/**
 * Keep preferences attached to the right face when a command changed rooms (owner rule, F-C):
 * - a room whose SIZE is unchanged was only translated: its offsets are kept, so the preferred
 *   face moves with the room;
 * - a room whose SIZE changed (min-corner anchored, possibly also moved) keeps each preferred face
 *   at its ABSOLUTE grid cell: `offset += oldGrid - newGrid`. When that cell is no longer inside
 *   the resized room the rebased (out-of-range) offset is stored as is, so `checkFacePreference`
 *   reports `outside-room` and the edge becomes `unresolved` / `preferred-face-unavailable`.
 *   Another face is never chosen and the edge is never deleted.
 * Rooms missing from either document are left alone (`prunePreferences` handles removed edges).
 * Applies to any before/after pair of designs (a command, or an algorithm result applied in one
 * step). Returns `prefs` itself when nothing changes.
 */
export function rebasePreferences(
  prefs: FacePreferences,
  before: Pick<DesignDocumentV2, 'nodes'>,
  after: Pick<DesignDocumentV2, 'nodes'>,
): FacePreferences {
  const keys = Object.keys(prefs);
  if (keys.length === 0 || before.nodes === after.nodes) return prefs;
  const oldById = new Map(before.nodes.map((n) => [n.id, n]));
  const newById = new Map(after.nodes.map((n) => [n.id, n]));
  let next: Record<string, FacePreference> | null = null;
  for (const key of keys) {
    const pref = prefs[key]!;
    const oldRoom = oldById.get(pref.nodeId);
    const newRoom = newById.get(pref.nodeId);
    if (!oldRoom || !newRoom || oldRoom === newRoom || sameTriple(oldRoom.size, newRoom.size)) continue;
    const offset: [number, number, number] = [
      pref.offset[0] + oldRoom.grid[0] - newRoom.grid[0],
      pref.offset[1] + oldRoom.grid[1] - newRoom.grid[1],
      pref.offset[2] + oldRoom.grid[2] - newRoom.grid[2],
    ];
    if (sameTriple(offset, pref.offset)) continue;
    next ??= { ...prefs };
    next[key] = { nodeId: pref.nodeId, offset, direction: pref.direction };
  }
  return next ?? prefs;
}

/**
 * `resolveRelationships` with face preferences applied:
 * - an edge whose preference is not a currently shared face becomes `unresolved` /
 *   `preferred-face-unavailable`; it is removed from the document BEFORE routing, so it reserves
 *   no connector cells (it is never silently routed or opened on another face);
 * - an edge with a valid preference is `direct` and carries `preferredFace`;
 * - preferences of unknown edges, and (defensively) of non-`access` edges, are ignored: an `open`
 *   relationship has no door and therefore no preferred face, and commands never store one.
 * Without (applicable) preferences the result is exactly `resolveRelationships(doc)`.
 */
export function resolveWithPreferences(doc: DesignDocumentV2, preferences: FacePreferences): SpatialResolution {
  const preferred = new Map<string, SharedFace>();
  const unavailable = new Map<string, string>();
  for (const edge of doc.edges) {
    if (edge.kind !== 'access' || !Object.prototype.hasOwnProperty.call(preferences, edge.id)) continue;
    const check = checkFacePreference(doc, edge, preferences[edge.id]!);
    if (check.ok) preferred.set(edge.id, check.face);
    else unavailable.set(edge.id, `the wall chosen for the connection between "${edge.source}" and "${edge.target}" ${NOT_AVAILABLE_TEXT[check.reason]}`);
  }
  if (preferred.size === 0 && unavailable.size === 0) return resolveRelationships(doc);

  const base = resolveRelationships(unavailable.size === 0 ? doc : { ...doc, edges: doc.edges.filter((e) => !unavailable.has(e.id)) });
  const edges: EdgeResolution[] = doc.edges.map((edge) => {
    const message = unavailable.get(edge.id);
    if (message !== undefined) {
      return { edgeId: edge.id, kind: edge.kind, status: 'unresolved', reason: 'preferred-face-unavailable', message };
    }
    const r = base.byEdge.get(edge.id)!;
    const face = preferred.get(edge.id);
    return face !== undefined && r.status === 'direct' ? { ...r, preferredFace: face } : r;
  });
  return { edges, byEdge: new Map(edges.map((r) => [r.edgeId, r])), occupancy: base.occupancy };
}
