import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
import { MAX_NAME_LENGTH } from '@app/session/projectStore';
import { domFocusScope, handleDialogKeyDown } from '@app/ui/concepts/dialogKeys';
import { DEFAULT_PROJECT_NAME, recentRows, type DefinitionChoice, type RecentState } from './welcomeModel';
import './welcome.css';

export interface WelcomeProps {
  /** Course (code) projects that can supply functions and algorithms. */
  readonly definitions: readonly DefinitionChoice[];
  readonly defaultDefinitionId: string | null;
  readonly recent: RecentState;
  /** Shown while an action runs (e.g. "Opening project…"); disables the actions. */
  readonly busy?: string | null;
  /** A failure of the last action (e.g. a file that could not be opened). */
  readonly error?: ReactNode;
  readonly onCreate: (name: string, definitionId: string | null) => void;
  readonly onOpenFile: (file: File) => void;
  readonly onTryExample: () => void;
  readonly onRestore: (projectId: string) => void;
  /** Explicit user decision, confirmed here: delete an unreadable stored record (a copy is kept aside). */
  readonly onDiscardUnreadable: (projectId: string) => void;
  /** Open with the Create form showing (e.g. from Project → New project). */
  readonly startWith?: 'choices' | 'create';
}

/**
 * Welcome (UI refinement 2026-11-17): a modal overlay on top of the application shell, shown at
 * every startup — a stored project is never reopened automatically. The shell behind it is empty
 * and inert (the modal makes it so; nothing is created or saved to draw it).
 *
 * Three entry actions (Create project, the strongest; Open project; Try example), then the projects
 * saved in this browser (name, scenarios, last edited), with a short note on where they are stored.
 * Keyboard: focus starts on Create project; Tab stays inside; Escape does nothing (there is nothing
 * behind Welcome to return to).
 */
export function Welcome({
  definitions,
  defaultDefinitionId,
  recent,
  busy = null,
  error = null,
  onCreate,
  onOpenFile,
  onTryExample,
  onRestore,
  onDiscardUnreadable,
  startWith = 'choices',
}: WelcomeProps) {
  const [creating, setCreating] = useState(startWith === 'create');
  const [name, setName] = useState(DEFAULT_PROJECT_NAME);
  const [definition, setDefinition] = useState<string>(defaultDefinitionId ?? '');
  const disabled = busy !== null;
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (typeof el.showModal === 'function' && !el.open) el.showModal();
    else el.setAttribute('open', '');
    el.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => {
      if (el.open && typeof el.close === 'function') el.close();
    };
  }, []);

  // Move focus into the Create form when it opens, and back to the actions when it closes.
  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>(creating ? '.sgl-welcome-create input' : '[data-autofocus]')?.focus();
  }, [creating]);

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (file) onOpenFile(file);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (creating && !disabled) setCreating(false);
      return;
    }
    handleDialogKeyDown(
      {
        key: event.key,
        shiftKey: event.shiftKey,
        preventDefault: () => event.preventDefault(),
        stopPropagation: () => {
          event.stopPropagation();
          event.nativeEvent.stopPropagation();
        },
      },
      () => domFocusScope(event.currentTarget),
      () => undefined,
    );
  };

  return (
    <dialog ref={dialog} className="sgl-welcome" aria-labelledby="sgl-welcome-title" aria-describedby="sgl-welcome-lead" onKeyDown={onKeyDown} onCancel={(e) => e.preventDefault()}>
      <div className="sgl-welcome-card">
        <header className="sgl-welcome-head">
          <h2 id="sgl-welcome-title">Welcome to Spatial Graph Lab</h2>
          <p id="sgl-welcome-lead" className="sgl-welcome-lead">
            Design buildings as graphs of rooms and their relationships, then explore them as plans and in 3D.
          </p>
        </header>

        {error && <div className="sgl-welcome-error">{error}</div>}
        {busy && (
          <p className="sgl-welcome-busy" role="status">
            {busy}
          </p>
        )}

        <section className="sgl-welcome-start" aria-label="Start">
          {creating ? (
            <form
              className="sgl-welcome-create"
              onSubmit={(e) => {
                e.preventDefault();
                onCreate(name, definition || null);
              }}
            >
              <h3>Create project</h3>
              <label className="sgl-form-row sgl-stacked">
                <span>Project name</span>
                <input type="text" value={name} maxLength={MAX_NAME_LENGTH} onChange={(e) => setName(e.currentTarget.value)} disabled={disabled} />
              </label>
              {definitions.length > 1 && (
                <label className="sgl-form-row sgl-stacked">
                  <span>Course</span>
                  <select value={definition} onChange={(e) => setDefinition(e.currentTarget.value)} disabled={disabled} aria-label="Course">
                    {definitions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p className="sgl-help">The project starts with one empty scenario and the required attributes. The course supplies the functions and algorithms.</p>
              <div className="sgl-buttons">
                <button type="submit" className="primary" disabled={disabled}>
                  Create project
                </button>
                <button type="button" onClick={() => setCreating(false)} disabled={disabled}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="sgl-welcome-actions">
              <button type="button" className="sgl-welcome-action is-primary" data-autofocus onClick={() => setCreating(true)} disabled={disabled}>
                <span className="sgl-welcome-action-title">Create project</span>
                <span className="sgl-welcome-action-sub">Start from an empty graph</span>
              </button>
              <label className={`sgl-welcome-action file-button${disabled ? ' is-disabled' : ''}`}>
                <span className="sgl-welcome-action-title">Open project</span>
                <span className="sgl-welcome-action-sub">A project file from your computer</span>
                <input type="file" accept=".json,application/json" onChange={onFile} disabled={disabled} aria-label="Open project" />
              </label>
              <button type="button" className="sgl-welcome-action" onClick={onTryExample} disabled={disabled}>
                <span className="sgl-welcome-action-title">Try example</span>
                <span className="sgl-welcome-action-sub">A two-storey building to explore</span>
              </button>
            </div>
          )}
        </section>

        <section className="sgl-welcome-recent" aria-labelledby="sgl-welcome-recent-title">
          <h3 id="sgl-welcome-recent-title">Recent projects</h3>
          <RecentList recent={recent} disabled={disabled} onRestore={onRestore} onDiscardUnreadable={onDiscardUnreadable} />
          <p className="sgl-help sgl-welcome-storage-note">Projects are saved in this browser. Export a project for a portable copy.</p>
        </section>
      </div>
    </dialog>
  );
}

function RecentList({
  recent,
  disabled,
  onRestore,
  onDiscardUnreadable,
}: {
  readonly recent: RecentState;
  readonly disabled: boolean;
  readonly onRestore: (projectId: string) => void;
  readonly onDiscardUnreadable: (projectId: string) => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  if (recent.status === 'loading') return <p className="meta">Looking for saved projects…</p>;
  if (recent.status === 'unavailable') {
    return (
      <p className="sgl-welcome-storage" role="alert">
        Saved projects cannot be listed: this browser’s storage is not available ({recent.message}). New projects cannot be saved here either; export your work to keep it.
      </p>
    );
  }
  const rows = recentRows(recent.items, undefined, recent.unsaved ?? []);
  if (rows.length === 0) return <p className="meta sgl-recent-empty">No saved projects yet.</p>;
  return (
    <ul className="sgl-recent-list">
      {rows.map((row) =>
        row.kind === 'ok' ? (
          <li key={row.projectId} className="sgl-recent" data-project-id={row.projectId}>
            <button type="button" className="sgl-recent-open" onClick={() => onRestore(row.projectId)} disabled={disabled} title={`Open “${row.name}”`}>
              <span className="sgl-recent-name">{row.name}</span>
              {row.unsaved && (
                <span className="sgl-recent-tag" title="Your last session. It was not saved locally, so it is replaced when you create or open another project.">
                  last session · not saved
                </span>
              )}
              <span className="sgl-recent-detail">{row.detail}</span>
            </button>
          </li>
        ) : (
          <li key={row.projectId} className="sgl-recent is-unreadable" data-project-id={row.projectId}>
            <div className="sgl-recent-open" aria-disabled="true">
              <span className="sgl-recent-name">
                <span aria-hidden="true">⚠</span> Unreadable project
              </span>
              <span className="sgl-recent-detail">{row.detail}</span>
            </div>
            {confirming === row.projectId ? (
              <div className="sgl-buttons" role="alertdialog" aria-label="Discard the unreadable project?">
                <span className="sgl-recent-detail">Remove it from this list?{row.quarantined ? ' The kept copy stays in the browser.' : ''}</span>
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    setConfirming(null);
                    onDiscardUnreadable(row.projectId);
                  }}
                  disabled={disabled}
                >
                  Discard
                </button>
                <button type="button" onClick={() => setConfirming(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="sgl-buttons">
                <button type="button" onClick={() => setConfirming(row.projectId)} disabled={disabled}>
                  Discard…
                </button>
              </div>
            )}
          </li>
        ),
      )}
    </ul>
  );
}

/** The neutral, empty application shell drawn behind Welcome (no project, no views, inert). */
export function EmptyShell({ labels }: { readonly labels: readonly string[] }) {
  return (
    <div className="sgl-empty-shell" aria-hidden="true" inert>
      <nav className="sgl-empty-rail">
        {labels.map((l) => (
          <span key={l} className="sgl-empty-rail-item">
            <span className="sgl-empty-rail-dot" />
            {l}
          </span>
        ))}
      </nav>
      <div className="sgl-empty-views">
        <div className="sgl-empty-view" />
        <div className="sgl-empty-view" />
      </div>
    </div>
  );
}
