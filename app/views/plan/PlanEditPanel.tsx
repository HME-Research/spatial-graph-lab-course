import { useEffect } from 'react';
import type { RoomEditing } from '../three/editing/useRoomEditing';

/** How long an information or warning message stays (errors stay until dismissed), as in the 3D views. */
const FEEDBACK_LIFETIME_MS = 5000;

/**
 * The Plan's "Edit rooms" status box (bottom right): a hint while no room on this storey is
 * selected, the live preview status during a drag, outcome messages, and the corridor
 * confirmation (Cancel / Move anyway and recalculate) — the same session and wording as the 3D
 * views' `RoomEditPanel`, laid out for the Plan.
 */
export function PlanEditPanel({ editing, editable }: { readonly editing: RoomEditing; readonly editable: boolean }) {
  const { state, feedback, dismissFeedback } = editing;
  useEffect(() => {
    if (!feedback || feedback.tone === 'error' || state.phase === 'confirm') return;
    const timer = setTimeout(dismissFeedback, FEEDBACK_LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [feedback, state.phase, dismissFeedback]);
  const confirming = state.phase === 'confirm';
  const status = state.phase === 'dragging' ? editing.status : null;
  const hint = !editable && !status && !confirming && !feedback ? 'Select a room on this storey to move or resize it.' : null;
  return (
    <div className="sgl-plan-edit-panel" role="group" aria-label="Room edit">
      {hint && <div className="sgl-plan-edit-hint">{hint}</div>}
      {!hint && !status && !confirming && !feedback && <div className="sgl-plan-edit-hint">Drag the room or its sides, or use the arrow keys (Shift: resize) · {editing.hint}</div>}
      {status && (
        <div className={`sgl-plan-edit-status tone-${editing.tone}`} aria-live="polite">
          {status}
        </div>
      )}
      {feedback && (
        <div className={`sgl-plan-edit-message tone-${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'}>
          <span>{feedback.text}</span>
          {!confirming && (
            <button type="button" className="sgl-plan-edit-dismiss" onClick={dismissFeedback} aria-label="Dismiss message">
              ×
            </button>
          )}
        </div>
      )}
      {confirming && (
        <div className="sgl-plan-edit-confirm">
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
