import { AXIS_COLORS } from '@core/viewer/three/SnappedGizmo';
import { GIZMO_AXES, type GizmoMode } from '@core/viewer/three/gizmoMath';
import { formatGrid, formatSize } from './roomGeometry';
import type { RoomEditing } from './useRoomEditing';
import { useContext, useEffect } from 'react';
import { EditPanelOwnerContext, PanelIndexContext } from './editPanelOwner';
import './editing.css';

/**
 * HTML overlay part of room editing (place in a SceneCanvas `overlay`): selected room, Move/Resize
 * mode, snapping hint, live preview status, outcome messages, the corridor confirmation
 * (Cancel / Move anyway and recalculate) and keyboard-accessible one-cell step buttons.
 * Renders nothing while editing is inactive and there is no message to show.
 */
/** How long an information or warning message stays (errors stay until dismissed). */
export const FEEDBACK_LIFETIME_MS = 5000;

export function RoomEditPanel({ editing }: { readonly editing: RoomEditing }) {
  const { active, geometry, state, feedback } = editing;
  const owner = useContext(EditPanelOwnerContext);
  const index = useContext(PanelIndexContext);
  // Information and warnings disappear on their own after a few seconds (errors stay until dismissed),
  // so a message never keeps the panel enlarged over the handles.
  const { dismissFeedback } = editing;
  useEffect(() => {
    if (!feedback || feedback.tone === 'error' || state.phase === 'confirm') return;
    const timer = setTimeout(dismissFeedback, FEEDBACK_LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [feedback, state.phase, dismissFeedback]);
  if (!active && !feedback) return null;
  // Voxels + Building: only the panel last interacted with shows the editor (never hidden mid-edit).
  if (owner !== null && index !== null && owner !== index && state.phase === 'idle') return null;
  const busy = state.phase !== 'idle';
  const confirming = state.phase === 'confirm';
  return (
    <div className="viewer3d-panel room-edit" role="group" aria-label="Edit selected room">
      {active && geometry && (
        <>
          <div className="room-edit-head">
          <div className="room-edit-title" title={`${formatSize(geometry.size)} at ${formatGrid(geometry.grid)}`}>
            <strong>Room {editing.label}</strong>{' '}
            <span>
              {formatSize(geometry.size)} at {formatGrid(geometry.grid)}
            </span>
          </div>
          <div className="room-edit-modes" role="radiogroup" aria-label="Gizmo mode">
            {(['move', 'resize'] as const satisfies readonly GizmoMode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={editing.mode === m}
                className={editing.mode === m ? 'active' : undefined}
                disabled={busy}
                onClick={() => editing.setMode(m)}
                title={m === 'move' ? 'Arrows move the room by whole cells' : 'Cubes resize the room by whole cells (its lowest corner stays)'}
              >
                {m === 'move' ? 'Move' : 'Resize'}
              </button>
            ))}
          </div>
          </div>
          <div className="room-edit-steps" aria-label={editing.mode === 'move' ? 'Move one cell' : 'Resize by one cell'}>
            {GIZMO_AXES.map((axis) => (
              <span key={axis} className="room-edit-axis">
                <span className="room-edit-axis-name" style={{ color: AXIS_COLORS[axis] }}>
                  {axis}
                </span>
                <button type="button" disabled={busy} onClick={() => editing.nudge(axis, -1)} aria-label={`${axis} minus one cell`}>
                  −
                </button>
                <button type="button" disabled={busy} onClick={() => editing.nudge(axis, 1)} aria-label={`${axis} plus one cell`}>
                  +
                </button>
              </span>
            ))}
          </div>
          <div className="room-edit-hint">
            {editing.hint}
            {editing.mode === 'resize' ? ' · minimum corner stays' : ''} · Esc cancels a drag
          </div>
          {editing.status && (
            <div className={`room-edit-status tone-${editing.tone}`} aria-live="polite">
              {editing.status}
            </div>
          )}
        </>
      )}
      {feedback && (
        <div className={`room-edit-message tone-${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'}>
          <span>{feedback.text}</span>
          {!confirming && (
            <button type="button" className="room-edit-dismiss" onClick={editing.dismissFeedback} aria-label="Dismiss message">
              ×
            </button>
          )}
        </div>
      )}
      {confirming && (
        <div className="room-edit-confirm">
          <button type="button" onClick={editing.cancel}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={editing.confirm}>
            Move anyway and recalculate
          </button>
        </div>
      )}
    </div>
  );
}
