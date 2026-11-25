import { useState, type FormEvent } from 'react';
import type { ProjectController } from '@app/session/projectStoreController';
import { useProjectController, useProjectControllerState } from '@app/session/projectStoreContext';
import { MAX_NAME_LENGTH, nextScenarioName } from '@app/session/projectStore';
import { Dialog } from '@app/ui/Dialog';
import { SaveStatus } from './SaveStatus';
import { scenarioRows, scenarioSummary, type ScenarioRow } from './scenariosModel';
import './scenarios.css';

/**
 * Scenarios destination (Gate F slot `DESTINATION_PANELS.scenarios`, no props). Lists the open
 * project's scenarios — independent design alternatives, each with its own graph, geometry,
 * attribute values, wall preferences and undo history — and creates, duplicates, renames, deletes
 * (never the last; confirmed) and switches them. This is the ONLY place to switch scenario (the
 * header just names the active one). Harmless actions (switch, rename, duplicate) need no dialog.
 */
export function ScenariosPanel() {
  const controller = useProjectController();
  const state = useProjectControllerState(controller);
  const project = state.project;
  if (!controller || !project) {
    return (
      <div className="sgl-scenarios" data-placeholder="scenarios">
        <p className="meta">Scenarios are not available yet: no project is open. Create or open a project to work with scenarios.</p>
      </div>
    );
  }
  return <ScenarioList controller={controller} rows={scenarioRows(project)} defaultName={nextScenarioName(project)} blocked={state.save.local === 'blocked'} />;
}

type Editing = { readonly kind: 'rename'; readonly id: string } | { readonly kind: 'delete'; readonly id: string } | { readonly kind: 'create' } | null;

type Reportable = { readonly ok: true } | { readonly ok: false; readonly message: string };

export function ScenarioList({
  controller,
  rows,
  defaultName,
  initialEditing = null,
  blocked = false,
}: {
  readonly controller: ProjectController;
  readonly rows: readonly ScenarioRow[];
  readonly defaultName: string;
  /** For static rendering tests only. */
  readonly initialEditing?: Editing;
  /** The project could not be saved: show the save problem and its actions here too. */
  readonly blocked?: boolean;
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
  const deleting = editing?.kind === 'delete' ? rows.find((r) => r.id === editing.id) : undefined;

  return (
    <div className="sgl-scenarios">
      <p className="sgl-help">Each scenario is an independent alternative within this project. Click one to work on it.</p>
      <ul className="sgl-scenario-list" aria-label="Scenarios">
        {rows.map((row) => {
          const renaming = editing?.kind === 'rename' && editing.id === row.id;
          return (
            <li key={row.id} className={`sgl-scenario${row.active ? ' is-active' : ''}`} data-scenario-id={row.id}>
              {renaming ? (
                <NameForm label={`New name for ${row.name}`} initial={row.name} onSubmit={(name) => report(controller.renameScenario(row.id, name))} onCancel={cancel} />
              ) : (
                <button
                  type="button"
                  className="sgl-scenario-switch"
                  aria-current={row.active ? 'true' : undefined}
                  onClick={() => report(controller.switchScenario(row.id))}
                  title={row.active ? 'This scenario is shown in the views' : `Switch to ${row.name}`}
                >
                  <span className="sgl-scenario-name">{row.name}</span>
                  <span className="sgl-scenario-meta">{scenarioSummary(row)}</span>
                </button>
              )}
              {!renaming && (
                <span className="sgl-scenario-actions">
                  <button type="button" className="sgl-icon-action" onClick={() => setEditing({ kind: 'rename', id: row.id })} aria-label={`Rename ${row.name}`} title="Rename">
                    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                      <path d="M3 13l.6-2.6L10.5 3.5l2 2-6.9 6.9L3 13z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button type="button" className="sgl-icon-action" onClick={() => report(controller.duplicateScenario(row.id))} aria-label={`Duplicate ${row.name}`} title="Duplicate">
                    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                      <rect x="5.5" y="5.5" width="8" height="8" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M10.5 3.5V3a.9.9 0 00-.9-.9H3.4a.9.9 0 00-.9.9v6.2c0 .5.4.9.9.9h.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="sgl-icon-action"
                    disabled={only}
                    onClick={() => setEditing({ kind: 'delete', id: row.id })}
                    aria-label={`Delete ${row.name}`}
                    title={only ? 'A project needs at least one scenario' : 'Delete…'}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </span>
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
      <button type="button" className="sgl-attr-add" onClick={() => setEditing({ kind: 'create' })}>
        <span aria-hidden="true">+</span> New scenario
      </button>

      {blocked && <SaveStatus controller={controller} />}

      {editing?.kind === 'create' && (
        <CreateDialog defaultName={defaultName} error={error} onSubmit={(name, from) => report(controller.createScenario({ name, from }))} onCancel={cancel} />
      )}
      {deleting && (
        <Dialog
          title={`Delete scenario “${deleting.name}”?`}
          onClose={cancel}
          dialogId="delete-scenario"
          footer={
            <>
              <button type="button" data-autofocus onClick={cancel}>
                Cancel
              </button>
              <button type="button" className="sgl-danger" onClick={() => report(controller.deleteScenario(deleting.id))}>
                Delete scenario
              </button>
            </>
          }
        >
          <p className="sgl-dialog-text">
            Its nodes, edges, values and undo history are removed from the project ({scenarioSummary(deleting)}). The project’s attributes and other scenarios are not changed.
          </p>
          {error && (
            <p className="sgl-dialog-error" role="alert">
              {error}
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}

function NameForm({ label, initial, onSubmit, onCancel }: { readonly label: string; readonly initial: string; readonly onSubmit: (name: string) => boolean; readonly onCancel: () => void }) {
  const [name, setName] = useState(initial);
  const go = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === initial) onCancel();
    else onSubmit(name);
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
        onBlur={() => (name.trim() === initial || name.trim() === '' ? onCancel() : onSubmit(name))}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
      />
    </form>
  );
}

function CreateDialog({
  defaultName,
  error,
  onSubmit,
  onCancel,
}: {
  readonly defaultName: string;
  readonly error: string | null;
  readonly onSubmit: (name: string, from: 'current' | 'blank') => boolean;
  readonly onCancel: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [from, setFrom] = useState<'current' | 'blank'>('current');
  return (
    <Dialog
      title="New scenario"
      onClose={onCancel}
      dialogId="new-scenario"
      footer={
        <>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" form="sgl-new-scenario" className="sgl-primary">
            Create scenario
          </button>
        </>
      }
    >
      <form
        id="sgl-new-scenario"
        className="sgl-dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(name, from);
        }}
      >
        <label className="sgl-dialog-field">
          <span>Name</span>
          <input type="text" data-autofocus value={name} maxLength={MAX_NAME_LENGTH} aria-label="New scenario name" onChange={(e) => setName(e.currentTarget.value)} />
        </label>
        <fieldset className="sgl-scenario-from">
          <legend>Start from</legend>
          <label>
            <input type="radio" name="sgl-scenario-from" checked={from === 'current'} onChange={() => setFrom('current')} /> A copy of the active scenario
          </label>
          <label>
            <input type="radio" name="sgl-scenario-from" checked={from === 'blank'} onChange={() => setFrom('blank')} /> An empty scenario
          </label>
        </fieldset>
        {error && (
          <p className="sgl-dialog-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
