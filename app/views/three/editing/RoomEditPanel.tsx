import { AXIS_COLORS } from '@core/viewer/three/SnappedGizmo';
import { GIZMO_AXES, type GizmoMode } from '@core/viewer/three/gizmoMath';
import { formatGrid, formatSize } from './roomGeometry';
import type { RoomEditing } from './useRoomEditing';
import './editing.css';

/**
 * HTML overlay part of room editing (place in a SceneCanvas `overlay`): selected room, Move/Resize
 * mode, snapping hint, live preview status, outcome messages, the corridor confirmation
 * (Cancel / Move anyway and recalculate) and keyboard-accessible one-cell step buttons.
 * Renders nothing while editing is inactive and there is no message to show.
 */
export function RoomEditPanel({ editing }: { readonly editing: RoomEditing }) {
  const { active, geometry, state, feedback } = editing;
  if (!active && !feedback) return null;
  const busy = state.phase !== 'idle';
  const confirming = state.phase === 'confirm';
  return (
    <div className="viewer3d-panel room-edit" role="group" aria-label="Edit selected room">
      {active && geometry && (
        <>
          <div className="room-edit-title">
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
              >
                {m === 'move' ? 'Move' : 'Resize'}
              </button>
            ))}
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
