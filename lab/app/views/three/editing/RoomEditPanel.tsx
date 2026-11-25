import type { RoomEditing } from './useRoomEditing';
import { useContext, useEffect } from 'react';
import { EditPanelOwnerContext, PanelIndexContext } from './editPanelOwner';
import './editing.css';

/**
 * HTML overlay part of room editing (place in a SceneCanvas `overlay`): the live preview status
 * while a gizmo drag runs, outcome messages and the corridor confirmation (Cancel / Move anyway and
 * recalculate). Nothing is shown for a merely selected room: moving and resizing are done with the
 * gizmo or in Properties (owner 2026-11-17: the Move/Resize step panel was removed).
 */
/** How long an information or warning message stays (errors stay until dismissed). */
export const FEEDBACK_LIFETIME_MS = 5000;

export function RoomEditPanel({ editing }: { readonly editing: RoomEditing }) {
  const { active, state, feedback } = editing;
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
  const confirming = state.phase === 'confirm';
  const dragStatus = active && state.phase === 'dragging' ? editing.status : null;
  if (!dragStatus && !confirming && !feedback) return null;
  // Voxels + Building: only the panel last interacted with shows the editor (never hidden mid-edit).
  if (owner !== null && index !== null && owner !== index && state.phase === 'idle') return null;
  return (
    <div className="viewer3d-panel room-edit" role="group" aria-label="Room edit">
      {dragStatus && (
        <div className={`room-edit-status tone-${editing.tone}`} aria-live="polite">
          {dragStatus}
        </div>
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
