import { useState, type ChangeEvent, type ReactNode } from 'react';
import { MAX_NAME_LENGTH } from '@app/session/projectStore';
import { DEFAULT_PROJECT_NAME, recentRows, type DefinitionChoice, type RecentState } from './welcomeModel';
import './welcome.css';

export interface WelcomeProps {
  /** Code projects that can supply types and algorithms. */
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
  /** Open with the Create form showing (e.g. from Project Files → New). */
  readonly startWith?: 'choices' | 'create';
}

/**
 * Welcome screen (workstream B). Always shown at startup — a stored project is never reopened
 * automatically. Offers Create, Open (a project file or a design file), Try Example and the
 * projects stored in this browser (Recent), including records that cannot be read.
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

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (file) onOpenFile(file);
  };

  return (
    <div className="sgl-welcome" role="region" aria-label="Welcome">
      <div className="sgl-welcome-card">
        <header className="sgl-welcome-head">
          <h2>Welcome</h2>
          <p className="sgl-welcome-lead">Design buildings as graphs of rooms and relationships. Start a project, open a file or try the example.</p>
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
              <h3>Create a project</h3>
              <label className="sgl-form-row">
                Project name
                <input type="text" value={name} maxLength={MAX_NAME_LENGTH} onChange={(e) => setName(e.currentTarget.value)} autoFocus disabled={disabled} />
              </label>
              {definitions.length > 0 && (
                <label className="sgl-form-row">
                  Room types and algorithms from
                  <select value={definition} onChange={(e) => setDefinition(e.currentTarget.value)} disabled={disabled} aria-label="Room types and algorithms from">
                    {definitions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p className="sgl-help">The project starts with one scenario: that course project’s starting design.</p>
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
              <button type="button" className="sgl-welcome-action is-primary" onClick={() => setCreating(true)} disabled={disabled}>
                <span className="sgl-welcome-action-title">Create project</span>
                <span className="sgl-welcome-action-sub">A new project from a course starting design</span>
              </button>
              <label className={`sgl-welcome-action file-button${disabled ? ' is-disabled' : ''}`}>
                <span className="sgl-welcome-action-title">Open file…</span>
                <span className="sgl-welcome-action-sub">A project file, or a single design file (JSON)</span>
                <input type="file" accept=".json,application/json" onChange={onFile} disabled={disabled} aria-label="Open a project or design file" />
              </label>
              <button type="button" className="sgl-welcome-action" onClick={onTryExample} disabled={disabled}>
                <span className="sgl-welcome-action-title">Try Example</span>
                <span className="sgl-welcome-action-sub">The two-storey example, as a new project</span>
              </button>
            </div>
          )}
        </section>

        <section className="sgl-welcome-recent" aria-label="Recent local projects">
          <h3>Recent local projects</h3>
          <RecentList recent={recent} disabled={disabled} onRestore={onRestore} onDiscardUnreadable={onDiscardUnreadable} />
          <p className="sgl-help">Projects are saved automatically in this browser. Use Export Project to keep or share a file.</p>
        </section>
      </div>
    </div>
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
  if (recent.status === 'loading') return <p className="meta">Looking for projects saved in this browser…</p>;
  if (recent.status === 'unavailable') {
    return (
      <p className="sgl-welcome-storage" role="alert">
        Projects saved in this browser cannot be listed: local storage is not available ({recent.message}). New projects cannot be saved here either;
        use Export Project to keep your work.
      </p>
    );
  }
  const rows = recentRows(recent.items);
  if (rows.length === 0) return <p className="meta">No projects are saved in this browser yet.</p>;
  return (
    <ul className="sgl-recent-list">
      {rows.map((row) =>
        row.kind === 'ok' ? (
          <li key={row.projectId} className="sgl-recent" data-project-id={row.projectId}>
            <button type="button" className="sgl-recent-open" onClick={() => onRestore(row.projectId)} disabled={disabled} title={`Open “${row.name}”`}>
              <span className="sgl-recent-name">{row.name}</span>
              <span className="sgl-recent-detail">{row.detail}</span>
              {row.description && <span className="sgl-recent-detail">{row.description}</span>}
            </button>
          </li>
        ) : (
          <li key={row.projectId} className="sgl-recent is-unreadable" data-project-id={row.projectId}>
            <div className="sgl-recent-open" aria-disabled="true">
              <span className="sgl-recent-name">
                <span aria-hidden="true">⚠</span> Unreadable project <code>{row.projectId}</code>
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
