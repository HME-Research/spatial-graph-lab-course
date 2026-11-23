import type { GizmoAxis, GizmoMode, GizmoSide, GizmoTone } from '@core/viewer/three/gizmoMath';
import { MAX_ROOM_SIZE, nodeLabel, type DesignDocumentV2, relationshipLabel } from '@app/document';
import type { DesignPort, SpatialEditProposal } from '@app/spatial';
import { applyAxisSteps, formatGrid, formatSize, sameGeometry, type RoomGeometry } from './roomGeometry';

/**
 * Pure state machine for snapped 3D move/resize of one room (no React, no Three.js). It talks only
 * to the frozen `DesignPort`: `proposeEdit` for previews and ONE `set-node-geometry` command per
 * completed gesture. It keeps no document or occupancy of its own.
 *
 *   idle ──beginDrag──▶ dragging ──updateDrag (preview only)──▶ dragging
 *   dragging ──endDrag──▶ idle            unchanged: nothing sent
 *                                         rejected (room overlap / invalid): nothing sent, restored
 *                                         ok: one command sent
 *                       ──▶ confirm       needs-confirmation (takes connector cells): nothing sent yet
 *   confirm ──confirmEdit──▶ idle         one command with confirmRouteDisplacement: true
 *   dragging | confirm ──cancelEdit──▶ idle   (Escape / Cancel): nothing sent
 */

export type RoomEditState =
  | { readonly phase: 'idle' }
  | {
      readonly phase: 'dragging';
      readonly nodeId: number;
      readonly mode: GizmoMode;
      readonly axis: GizmoAxis;
      /** Face being resized (+1 maximum, −1 minimum); irrelevant for move. */
      readonly side: GizmoSide;
      readonly start: RoomGeometry;
      readonly draft: RoomGeometry;
      /** Preview of `draft`; null while the draft equals the start. */
      readonly proposal: SpatialEditProposal | null;
    }
  | {
      readonly phase: 'confirm';
      readonly nodeId: number;
      readonly mode: GizmoMode;
      readonly draft: RoomGeometry;
      readonly displacedRoutes: readonly number[];
    };

export const IDLE: RoomEditState = Object.freeze({ phase: 'idle' });

export interface EditFeedback {
  readonly tone: 'info' | 'warning' | 'error';
  readonly text: string;
}

export interface EditStep {
  readonly state: RoomEditState;
  /** Message for the user, or null for none. */
  readonly feedback: EditFeedback | null;
}

const roomOf = (doc: DesignDocumentV2, nodeId: number) => doc.nodes.find((n) => n.id === nodeId);

/** "room 01" (display label, falling back to the id). */
function roomName(doc: DesignDocumentV2, nodeId: number): string {
  const node = roomOf(doc, nodeId);
  return `room ${node ? nodeLabel(node) : nodeId}`;
}

function list(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Start a gesture on the room's current stored geometry. Idle if the room does not exist. */
export function beginDrag(
  port: DesignPort,
  nodeId: number,
  mode: GizmoMode,
  axis: GizmoAxis,
  side: GizmoSide = 1,
): RoomEditState {
  const node = roomOf(port.doc, nodeId);
  if (!node) return IDLE;
  const start: RoomGeometry = { position: node.position, size: node.size };
  return { phase: 'dragging', nodeId, mode, axis, side, start, draft: start, proposal: null };
}

/** New snapped step count during a drag: preview only, never a command. */
export function updateDrag(port: DesignPort, state: RoomEditState, steps: number): RoomEditState {
  if (state.phase !== 'dragging') return state;
  return updateDraft(port, state, applyAxisSteps(state.start, state.mode, state.axis, steps, state.side));
}

/**
 * New snapped draft during a drag, however it was derived (the Plan's 2D handles move or resize on
 * x and y at once): preview only, never a command. The same `proposeEdit` rules as `updateDrag`.
 */
export function updateDraft(port: DesignPort, state: RoomEditState, draft: RoomGeometry): RoomEditState {
  if (state.phase !== 'dragging') return state;
  if (sameGeometry(draft, state.draft)) return state;
  const proposal = sameGeometry(draft, state.start)
    ? null
    : port.proposeEdit({ nodeId: state.nodeId, position: draft.position, size: draft.size });
  return { ...state, draft, proposal };
}

/** Pointer released: validate once more against the current document and commit at most once. */
export function endDrag(port: DesignPort, state: RoomEditState): EditStep {
  if (state.phase !== 'dragging') return { state, feedback: null };
  if (!roomOf(port.doc, state.nodeId) || sameGeometry(state.draft, state.start)) return { state: IDLE, feedback: null };
  const proposal = port.proposeEdit({ nodeId: state.nodeId, position: state.draft.position, size: state.draft.size });
  return settle(port, state.nodeId, state.mode, state.draft, proposal);
}

/** "Move anyway and recalculate": the only path that commits a route displacement. */
export function confirmEdit(port: DesignPort, state: RoomEditState): EditStep {
  if (state.phase !== 'confirm') return { state, feedback: null };
  return send(port, state.nodeId, state.mode, state.draft, true, []);
}

/** Escape or Cancel: nothing is sent; the room keeps its stored geometry. */
export function cancelEdit(state: RoomEditState): EditStep {
  return {
    state: IDLE,
    feedback: state.phase === 'confirm' ? { tone: 'info', text: 'Cancelled; nothing changed.' } : null,
  };
}

/**
 * Keyboard alternative (arrow keys, 2026-11-20): one whole-cell step as a complete gesture (at most
 * one command, so one Undo step). `side` is the face a resize moves (as for the gizmo's handles).
 */
export function nudge(port: DesignPort, nodeId: number, mode: GizmoMode, axis: GizmoAxis, steps: number, side: GizmoSide = 1): EditStep {
  const started = beginDrag(port, nodeId, mode, axis, side);
  if (started.phase !== 'dragging') return { state: IDLE, feedback: null };
  const draft = applyAxisSteps(started.start, mode, axis, steps, side);
  if (sameGeometry(draft, started.start)) {
    if (mode !== 'resize') return { state: IDLE, feedback: null };
    const grows = steps * side > 0;
    return {
      state: IDLE,
      feedback: { tone: 'info', text: grows ? `A room is at most ${MAX_ROOM_SIZE} cells in every direction.` : 'A room is at least 1 cell in every direction.' },
    };
  }
  return endDrag(port, { ...started, draft });
}

function settle(port: DesignPort, nodeId: number, mode: GizmoMode, draft: RoomGeometry, proposal: SpatialEditProposal): EditStep {
  const name = roomName(port.doc, nodeId);
  switch (proposal.status) {
    case 'rejected':
      return { state: IDLE, feedback: { tone: 'error', text: rejectionText(port.doc, name, proposal) } };
    case 'needs-confirmation':
      return {
        state: { phase: 'confirm', nodeId, mode, draft, displacedRoutes: proposal.displacedRoutes },
        feedback: {
          tone: 'warning',
          text:
            `${capitalise(name)} would take the connector cells of ${relationships(port.doc, proposal.displacedRoutes)}. ` +
            'Edges are kept; their connectors are recalculated and may become unresolved.',
        },
      };
    case 'ok':
      return send(port, nodeId, mode, draft, false, proposal.impacted.map((i) => i.edgeId));
  }
}

function send(
  port: DesignPort,
  nodeId: number,
  mode: GizmoMode,
  draft: RoomGeometry,
  confirmRouteDisplacement: boolean,
  impacted: readonly number[],
): EditStep {
  const name = roomName(port.doc, nodeId);
  const outcome = port.onCommand({
    type: 'set-node-geometry',
    nodeId,
    position: draft.position,
    size: draft.size,
    ...(confirmRouteDisplacement ? { confirmRouteDisplacement: true } : {}),
  });
  if (!outcome.ok) {
    const reason = outcome.issues[0]?.message ?? 'the change was refused';
    return { state: IDLE, feedback: { tone: 'error', text: `${capitalise(name)} was not changed: ${reason}.` } };
  }
  const done = mode === 'move' ? `Moved ${name} to ${formatGrid(draft.position)}.` : `Resized ${name} to ${formatSize(draft.size)} cells.`;
  const changed = impacted.length > 0 ? ` ${impacted.length} edge${impacted.length === 1 ? '' : 's'} changed status.` : '';
  return { state: IDLE, feedback: { tone: 'info', text: done + changed } };
}

function rejectionText(doc: DesignDocumentV2, name: string, proposal: Extract<SpatialEditProposal, { status: 'rejected' }>): string {
  if (proposal.collidingRooms.length > 0) {
    const others = proposal.collidingRooms.map((id) => roomName(doc, id));
    return `${capitalise(name)} cannot go there: it would overlap ${list(others)}. Restored.`;
  }
  const reason = proposal.issues[0]?.message ?? 'invalid placement';
  return `${capitalise(name)} cannot go there: ${reason}. Restored.`;
}

/** "relationship 04 ↔ 07" — readable room labels, never raw edge ids (phase 07, O08). */
const relationships = (doc: DesignDocumentV2, ids: readonly number[]) =>
  `edge${ids.length === 1 ? '' : 's'} ${list(ids.map((id) => relationshipLabel(doc, id)))}`;


const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ── Derived display helpers ────────────────────────────────────────────────────────────────

/** Preview tone for the gizmo box. */
export function previewTone(state: RoomEditState): GizmoTone {
  if (state.phase === 'confirm') return 'warning';
  if (state.phase !== 'dragging' || state.proposal === null) return 'normal';
  switch (state.proposal.status) {
    case 'rejected':
      return 'blocked';
    case 'needs-confirmation':
      return 'warning';
    case 'ok':
      return 'normal';
  }
}

/** One-line live status while dragging, or null when not dragging. */
export function dragStatus(doc: DesignDocumentV2, state: RoomEditState): string | null {
  if (state.phase !== 'dragging') return null;
  const where = `${formatSize(state.draft.size)} at ${formatGrid(state.draft.position)}`;
  const p = state.proposal;
  if (p === null) return `${where} (unchanged)`;
  switch (p.status) {
    case 'rejected':
      return p.collidingRooms.length > 0
        ? `${where}: overlaps ${list(p.collidingRooms.map((id) => roomName(doc, id)))}`
        : `${where}: ${p.issues[0]?.message ?? 'invalid'}`;
    case 'needs-confirmation':
      return `${where}: takes connector cells (confirmation needed)`;
    case 'ok':
      return where;
  }
}

/** Geometry to draw for the selected room: the draft during a gesture, else the stored room. */
export function displayedGeometry(doc: DesignDocumentV2, state: RoomEditState, nodeId: number): RoomGeometry | null {
  if ((state.phase === 'dragging' || state.phase === 'confirm') && state.nodeId === nodeId) return state.draft;
  const node = roomOf(doc, nodeId);
  return node ? { position: node.position, size: node.size } : null;
}
