import type { ProjectController } from '@app/session/projectStoreController';
import { useProjectControllerState } from '@app/session/projectStoreContext';
import { SAVE_ACTION_LABELS, saveStatusView, type SaveAction } from './scenariosModel';

/**
 * Local save indicator (workstream B). `compact` is the one-line header form; the full form
 * explains a blocked save and offers the actions that can resolve it. A blocked save is shown as
 * an alert and never as saved.
 */
export function SaveStatus({
  controller,
  compact = false,
  onSaveAs,
}: {
  readonly controller: ProjectController | null;
  readonly compact?: boolean;
  /** Save As New Project (the host asks for a name). Default: keep the current name. */
  readonly onSaveAs?: () => void;
}) {
  const state = useProjectControllerState(controller);
  const view = saveStatusView(state);
  if (!view || !controller) return null;
  const run = (action: SaveAction) => {
    if (action === 'retry') void controller.retrySave();
    else if (action === 'overwrite') {
      if (typeof window === 'undefined' || window.confirm('Replace the copy saved by the other tab or window with this version? Its changes will be lost.')) {
        void controller.overwriteStored();
      }
    } else if (onSaveAs) onSaveAs();
    else void controller.saveAs();
  };
  if (compact) {
    return (
      <span
        className={`sgl-save-status tone-${view.tone}`}
        data-save-state={state.save.local}
        role={view.tone === 'error' ? 'alert' : 'status'}
        title={view.detail ?? view.text}
      >
        <span aria-hidden="true">{view.tone === 'ok' ? '✓' : view.tone === 'busy' ? '…' : '✖'}</span> {view.text}
      </span>
    );
  }
  return (
    <div className={`sgl-save-panel tone-${view.tone}`} data-save-state={state.save.local} role={view.tone === 'error' ? 'alert' : 'status'}>
      <p className="sgl-save-text">
        <strong>{view.text}</strong>
      </p>
      {view.detail && <p className="sgl-help">{view.detail}</p>}
      {view.actions.length > 0 && (
        <div className="sgl-buttons">
          {view.actions.map((a) => (
            <button key={a} type="button" onClick={() => run(a)}>
              {SAVE_ACTION_LABELS[a]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
