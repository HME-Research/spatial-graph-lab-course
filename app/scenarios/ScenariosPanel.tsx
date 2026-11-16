import { useState, type FormEvent } from 'react';
import type { ProjectController } from '@app/session/projectStoreController';
import { useProjectController, useProjectControllerState } from '@app/session/projectStoreContext';
import { MAX_NAME_LENGTH, nextScenarioName } from '@app/session/projectStore';
import { SaveStatus } from './SaveStatus';
import { scenarioRows, scenarioSummary, type ScenarioRow } from './scenariosModel';
import './scenarios.css';

/**
 * Scenarios destination (workstream B; Gate F slot `DESTINATION_PANELS.scenarios`, no props).
 * Lists the open project's scenarios — complete design alternatives, each with its own undo
 * history — and creates, duplicates, renames, deletes (never the last; confirmed) and switches
 * them. This is the ONLY place to switch scenario (the header just names the active one). Shows
 * the local autosave state. Reads the controller from `ProjectControllerContext`.
 */
export function ScenariosPanel() {
  const controller = useProjectController();
  const state = useProjectControllerState(controller);
  const project = state.project;
  if (!controller || !project) {
    return (
      <div className="sgl-scenarios" data-placeholder="scenarios">
        <p className="meta">Scenarios are not available yet: no project is open. Create or open a project from the Welcome screen to work with scenarios.</p>
      </div>
    );
  }
  return <ScenarioList controller={controller} rows={scenarioRows(project)} defaultName={nextScenarioName(project)} />;
}

type Editing = { readonly kind: 'rename'; readonly id: string } | { readonly kind: 'delete'; readonly id: string } | { readonly kind: 'create' } | null;

type Reportable = { readonly ok: true } | { readonly ok: false; readonly message: string };

export function ScenarioList({
  controller,
  rows,
  defaultName,
  initialEditing = null,
}: {
  readonly controller: ProjectController;
  readonly rows: readonly ScenarioRow[];
  readonly defaultName: string;
  /** For static rendering tests only. */
  readonly initialEditing?: Editing;
}) {
  const [editing, setEditing] = useState<Editing>(initialEditing);
  const [error, setError] = useState<string | null>(null);
  const report = (outcome: Reportable): boolean => {
    setError(outcome.ok ? null : outcome.message);
    if (outcome.ok) setEditing(null);
    return outcome.ok;
  };
  const cancel = () => {
    setEditing(null);
    setError(null);
  };
  const only = rows.length === 1;

  return (
    <div className="sgl-scenarios">
      <section className="sgl-section">
        <h4>Scenarios</h4>
        <p className="sgl-help">Each scenario is a complete design alternative with its own undo history. Click a scenario to work on it.</p>
        <ul className="sgl-scenario-list" aria-label="Scenarios">
          {rows.map((row) => {
            const renaming = editing?.kind === 'rename' && editing.id === row.id;
            const deleting = editing?.kind === 'delete' && editing.id === row.id;
            return (
              <li key={row.id} className={`sgl-scenario${row.active ? ' is-active' : ''}`} data-scenario-id={row.id}>
                {renaming ? (
                  <NameForm label={`New name for ${row.name}`} initial={row.name} submit="Rename" onSubmit={(name) => report(controller.renameScenario(row.id, name))} onCancel={cancel} />
                ) : (
                  <button
                    type="button"
                    className="sgl-scenario-switch"
                    aria-current={row.active ? 'true' : undefined}
                    onClick={() => report(controller.switchScenario(row.id))}
                    title={row.active ? 'This scenario is shown in the views' : `Switch to ${row.name}`}
                  >
                    <span className="sgl-scenario-name">{row.name}</span>
                    <span className="sgl-scenario-meta">
                      {scenarioSummary(row)}
                      {row.active && <span className="sgl-scenario-badge">Active</span>}
                    </span>
                  </button>
                )}
                {deleting && (
                  <div className="sgl-scenario-confirm" role="alertdialog" aria-label={`Delete ${row.name}?`}>
                    <p>
                      Delete <strong>{row.name}</strong>? Its design and undo history are removed from the project.
                    </p>
                    <div className="sgl-buttons">
                      <button type="button" className="danger" onClick={() => report(controller.deleteScenario(row.id))}>
                        Delete scenario
                      </button>
                      <button type="button" onClick={cancel}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {!renaming && !deleting && (
                  <div className="sgl-scenario-actions">
                    <button type="button" onClick={() => setEditing({ kind: 'rename', id: row.id })} aria-label={`Rename ${row.name}`}>
                      Rename
                    </button>
                    <button type="button" onClick={() => report(controller.duplicateScenario(row.id))} aria-label={`Duplicate ${row.name}`}>
                      Duplicate
                    </button>
                    <button
                      type="button"
                      disabled={only}
                      onClick={() => setEditing({ kind: 'delete', id: row.id })}
                      aria-label={`Delete ${row.name}`}
                      title={only ? 'A project needs at least one scenario' : `Delete ${row.name}`}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {error && (
          <p className="sgl-scenario-error" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="sgl-section">
        <h4>New scenario</h4>
        {editing?.kind === 'create' ? (
          <CreateForm defaultName={defaultName} onSubmit={(name, from) => report(controller.createScenario({ name, from }))} onCancel={cancel} />
        ) : (
          <div className="sgl-buttons">
            <button type="button" onClick={() => setEditing({ kind: 'create' })}>
              + New scenario
            </button>
          </div>
        )}
      </section>

      <section className="sgl-section">
        <h4>Saving</h4>
        <SaveStatus controller={controller} />
      </section>
    </div>
  );
}

function NameForm({
  label,
  initial,
  submit,
  onSubmit,
  onCancel,
}: {
  readonly label: string;
  readonly initial: string;
  readonly submit: string;
  readonly onSubmit: (name: string) => boolean;
  readonly onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const go = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(name);
  };
  return (
    <form className="sgl-scenario-form" onSubmit={go}>
      <input
        type="text"
        value={name}
        maxLength={MAX_NAME_LENGTH}
        aria-label={label}
        autoFocus
        onChange={(e) => setName(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
      />
      <div className="sgl-buttons">
        <button type="submit">{submit}</button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function CreateForm({
  defaultName,
  onSubmit,
  onCancel,
}: {
  readonly defaultName: string;
  readonly onSubmit: (name: string, from: 'current' | 'blank') => boolean;
  readonly onCancel: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [from, setFrom] = useState<'current' | 'blank'>('current');
  return (
    <form
      className="sgl-scenario-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(name, from);
      }}
    >
      <label className="sgl-form-row">
        Name
        <input type="text" value={name} maxLength={MAX_NAME_LENGTH} aria-label="New scenario name" autoFocus onChange={(e) => setName(e.currentTarget.value)} />
      </label>
      <fieldset className="sgl-scenario-from">
        <legend>Start from</legend>
        <label>
          <input type="radio" name="sgl-scenario-from" checked={from === 'current'} onChange={() => setFrom('current')} /> A copy of the active scenario
        </label>
        <label>
          <input type="radio" name="sgl-scenario-from" checked={from === 'blank'} onChange={() => setFrom('blank')} /> An empty design
        </label>
      </fieldset>
      <div className="sgl-buttons">
        <button type="submit">Create scenario</button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
