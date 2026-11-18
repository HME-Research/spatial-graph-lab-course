import { useState, type ChangeEvent } from 'react';
import { MAX_NAME_LENGTH } from '@app/session/projectStore';
import type { ProjectController } from '@app/session/projectStoreController';
import { useProjectControllerState } from '@app/session/projectStoreContext';
import { SaveStatus } from '@app/scenarios/SaveStatus';
import { Dialog } from '@app/ui/Dialog';
import { ToolkitPicker, type ToolkitOption } from './ToolkitPicker';
import { formatWhen, projectFileName } from './welcomeModel';
import './welcome.css';

/** Start a browser download of `text` (JSON). Throws when the browser refuses. */
export function downloadText(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Export the open project (information, every scenario with its design, wall preferences, saved
 * views and display overrides, the project attributes and settings) as one JSON file. The exported
 * state becomes "exported" only after the download was started. Returns an error message, or null.
 */
export function exportProject(controller: ProjectController, download: (text: string, fileName: string) => void = downloadText): string | null {
  const out = controller.exportFile();
  if (!out.ok) return out.message;
  try {
    download(out.value.text, projectFileName(out.value.file.name));
  } catch (error) {
    return `Export failed: ${error instanceof Error ? error.message : String(error)}`;
  }
  controller.markExported(out.value.signature);
  return null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The Project panel's overview (UI refinement 2026-11-17): the project as a container.
 * - editable name and the compact local save state;
 * - the four project actions, each once: New project, Open project (a project file, or an older
 *   single-design file that becomes a project with one scenario), Export project, Save as new
 *   project (an independent copy of the whole project, named in a small dialog);
 * - information: description (optional), number of scenarios, last edited.
 * New and Open are host callbacks (they leave this project); Export and Save As run on the controller.
 */
export function ProjectFiles({
  controller,
  toolkits = [],
  defaultToolkitId = null,
  onNew,
  onOpenFile,
}: {
  readonly controller: ProjectController | null;
  /** Toolkits a new project can start from; with more than one, New project asks which. */
  readonly toolkits?: readonly ToolkitOption[];
  /** Preselected toolkit for New project (normally the open project's own). */
  readonly defaultToolkitId?: string | null;
  readonly onNew: (toolkitId: string | null) => void;
  readonly onOpenFile: (file: File) => void;
}) {
  const state = useProjectControllerState(controller);
  const project = state.project;
  const [saveAsName, setSaveAsName] = useState<string | null>(null);
  /** New project dialog: the toolkit being chosen (undefined: closed). */
  const [newToolkit, setNewToolkit] = useState<string | null | undefined>(undefined);
  const startNew = () => (toolkits.length > 1 ? setNewToolkit(defaultToolkitId) : onNew(toolkits[0]?.id ?? defaultToolkitId));
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (file) onOpenFile(file);
  };

  return (
    <div className="sgl-project-files">
      <div className="sgl-project-head">
        <ProjectNameField controller={controller} />
        {project && state.kept !== true ? (
          <div className="sgl-project-unsaved" role="status">
            <span className="sgl-save-status tone-busy" title="Autosaved as your last session only. Save it locally to keep it when you open or create another project.">
              Not saved locally
            </span>
            <button
              type="button"
              className="sgl-primary"
              onClick={() => controller && void controller.saveLocally().then((r) => setMessage(r.ok ? null : r.message))}
              title="Keep this project in this browser’s saved projects"
            >
              Save locally
            </button>
          </div>
        ) : (
          <SaveStatus controller={controller} compact />
        )}
      </div>

      <div className="sgl-project-actions" role="group" aria-label="Project actions">
        <button type="button" disabled={!project || !controller} onClick={() => controller && setMessage(exportProject(controller))} title="Download the whole project as one file: every scenario, the attributes and the settings">
          Export project
        </button>
        <button type="button" disabled={!project} onClick={() => project && setSaveAsName(`${project.meta.name.slice(0, MAX_NAME_LENGTH - 5)} copy`)} title="Continue in an independent copy of the whole project">
          Save as new project
        </button>
        <button type="button" onClick={startNew} title="Start another project (this one stays saved in this browser)">
          New project
        </button>
        <label className="file-button" title="Open a project file">
          Open project
          <input type="file" accept=".json,application/json" onChange={onFile} aria-label="Open a project file" />
        </label>
      </div>

      {message && (
        <p className="sgl-project-files-error" role="alert">
          {message}
        </p>
      )}

      {project && controller && (
        <>
          <DescriptionField key={project.meta.projectId} controller={controller} text={project.meta.description ?? ''} />
          <dl className="sgl-readonly-list sgl-project-facts">
            <dt>Scenarios</dt>
            <dd>{plural(project.scenarios.length, 'scenario')}</dd>
            <dt>Last edited</dt>
            <dd>{formatWhen(project.meta.updatedAt)}</dd>
          </dl>
          <p className="sgl-help">
            {state.kept === true
              ? 'Saved in this browser; changes are saved automatically. Export the project for a portable copy.'
              : 'Only your last session is kept automatically. Save locally to keep this project when you open another one; export it for a portable copy.'}
          </p>
        </>
      )}

      {saveAsName !== null && controller && (
        <Dialog
          title="Save as new project"
          lead={
            state.kept === true
              ? 'The copy gets every scenario, the attributes and the settings, and is saved in this browser. This project stays as it is.'
              : 'The copy gets every scenario, the attributes and the settings, and is saved in this browser. This unsaved session is replaced by the copy.'
          }
          onClose={() => !busy && setSaveAsName(null)}
          dialogId="save-as"
          footer={
            <>
              <button type="button" onClick={() => setSaveAsName(null)} disabled={busy}>
                Cancel
              </button>
              <button type="submit" form="sgl-save-as" className="sgl-primary" disabled={busy}>
                Save copy
              </button>
            </>
          }
        >
          <form
            id="sgl-save-as"
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              void controller.saveAs(saveAsName).then((r) => {
                setBusy(false);
                setMessage(r.ok ? null : r.message);
                if (r.ok) setSaveAsName(null);
              });
            }}
          >
            <label className="sgl-dialog-field">
              <span>Name of the new project</span>
              <input type="text" data-autofocus value={saveAsName} maxLength={MAX_NAME_LENGTH} onChange={(e) => setSaveAsName(e.currentTarget.value)} disabled={busy} />
            </label>
          </form>
        </Dialog>
      )}

      {newToolkit !== undefined && (
        <Dialog
          title="New project"
          lead="A new, empty project. This one stays saved in this browser."
          onClose={() => setNewToolkit(undefined)}
          dialogId="new-project"
          footer={
            <>
              <button type="button" onClick={() => setNewToolkit(undefined)}>
                Cancel
              </button>
              <button
                type="button"
                className="sgl-primary"
                data-autofocus
                onClick={() => {
                  const chosen = newToolkit;
                  setNewToolkit(undefined);
                  onNew(chosen);
                }}
              >
                Create project
              </button>
            </>
          }
        >
          <ToolkitPicker toolkits={toolkits} value={newToolkit} onChange={setNewToolkit} />
        </Dialog>
      )}
    </div>
  );
}

/** Optional project description (saved on blur). */
function DescriptionField({ controller, text }: { readonly controller: ProjectController; readonly text: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    if (draft.trim() !== text) controller.setDescription(draft.trim());
    setDraft(null);
  };
  return (
    <label className="sgl-form-row sgl-stacked sgl-project-description">
      <span>
        Description <span className="meta">optional</span>
      </span>
      <textarea rows={2} value={draft ?? text} placeholder="What is this project about?" onChange={(e) => setDraft(e.currentTarget.value)} onBlur={commit} />
    </label>
  );
}

/** Project name (rename on Enter or blur; Escape restores). */
export function ProjectNameField({ controller }: { readonly controller: ProjectController | null }) {
  const state = useProjectControllerState(controller);
  const name = state.project?.meta.name ?? '';
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!controller || !state.project) return null;
  const commit = () => {
    if (draft === null) return;
    const r = controller.renameProject(draft);
    setError(r.ok ? null : r.message);
    if (r.ok) setDraft(null);
  };
  return (
    <div className="sgl-project-name-field">
      <input
        type="text"
        className="sgl-project-name-input"
        aria-label="Project name"
        title="Project name (click to rename)"
        value={draft ?? name}
        maxLength={MAX_NAME_LENGTH}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft(null);
            setError(null);
          }
        }}
      />
      {error && (
        <p className="sgl-project-files-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
