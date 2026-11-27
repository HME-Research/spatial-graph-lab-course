import { useState, type ChangeEvent } from 'react';
import { MAX_NAME_LENGTH } from '@app/session/projectStore';
import type { ProjectController } from '@app/session/projectStoreController';
import { useProjectControllerState } from '@app/session/projectStoreContext';
import { SaveStatus } from '@app/scenarios/SaveStatus';
import { Dialog } from '@app/ui/Dialog';
import { OpenExampleDialog } from './OpenExampleDialog';
import { chosenFile } from './ToolkitDialogs';
import { ADD_TOOLKIT_LABEL, DOWNLOAD_TOOLKIT_LABEL, UPLOAD_TOOLKIT_LABEL } from './toolkitUpload';
import { ToolkitPicker, type ToolkitOption } from './ToolkitPicker';
import { serializeDesignV2 } from '@app/document';
import { currentDocument } from '@app/session/documentSession';
import { activeSession } from '@app/session/projectStore';
import { designFileName, formatWhen, newProjectStart, projectFileName, type ExampleChoice, type ExampleOption } from './welcomeModel';
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

/**
 * Export the ACTIVE scenario's design alone as a v2 design file (`serializeDesignV2`), the format a
 * toolkit's `designs/` folder accepts. Wall preferences, views and project settings are not part of
 * it. Does not change the project's exported state. Returns an error message, or null.
 */
export function exportDesign(controller: ProjectController, download: (text: string, fileName: string) => void = downloadText): string | null {
  const project = controller.getState().project;
  if (!project) return 'No project is open.';
  const design = currentDocument(activeSession(project)).design;
  try {
    download(serializeDesignV2(design), designFileName(design.metadata.name));
  } catch (error) {
    return `Export failed: ${error instanceof Error ? error.message : String(error)}`;
  }
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
  loadExamples,
  onOpenExample,
  busy: running = null,
  toolkit,
  onUploadToolkit,
  onDownloadToolkit,
  onAddToolkit,
}: {
  readonly controller: ProjectController | null;
  /** Toolkits a new project can start from; with any, New project asks which (or No toolkit). */
  readonly toolkits?: readonly ToolkitOption[];
  /** Preselected toolkit for New project: the same as Welcome's (normally null, "No toolkit"). */
  readonly defaultToolkitId?: string | null;
  readonly onNew: (toolkitId: string | null) => void;
  readonly onOpenFile: (file: File) => void;
  /** Open toolkit design… (owner 2026-11-20), as on Welcome; both absent: the button is not shown. */
  readonly loadExamples?: () => Promise<readonly ExampleOption[]>;
  readonly onOpenExample?: (choice: ExampleChoice) => void;
  /** A New / Open / Open example action still running (e.g. "Opening the example…"), shown under the actions. */
  readonly busy?: string | null;
  /**
   * The open project's toolkit (owner 2026-11-26): its name (null: none) and whether it was uploaded
   * as a zip. Absent: the Toolkit group is not shown.
   */
  readonly toolkit?: { readonly name: string | null; readonly uploaded: boolean };
  /** Upload toolkit (.zip): a new version of this project's uploaded toolkit, or another toolkit as a new project. */
  readonly onUploadToolkit?: (file: File) => void;
  /** Download toolkit (.zip): `<name>.zip` of this project's uploaded toolkit (absent: not offered). */
  readonly onDownloadToolkit?: () => void;
  /** Add a toolkit…: only for a project without one (absent: not offered). */
  readonly onAddToolkit?: () => void;
}) {
  const state = useProjectControllerState(controller);
  const project = state.project;
  const [saveAsName, setSaveAsName] = useState<string | null>(null);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  /** New project dialog: the toolkit being chosen (undefined: closed). */
  const [newToolkit, setNewToolkit] = useState<string | null | undefined>(undefined);
  const startNew = () => {
    const start = newProjectStart(toolkits.length, defaultToolkitId);
    if (start.kind === 'ask') setNewToolkit(start.toolkitId);
    else onNew(start.toolkitId);
  };
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
        <button type="button" disabled={!project || !controller} onClick={() => setExportOpen(true)} aria-haspopup="dialog" title="Download this scenario's design, or the whole project as one file">
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
        {loadExamples && onOpenExample && (
          <button type="button" onClick={() => setExamplesOpen(true)} aria-haspopup="dialog" title="Open the built-in example or a toolkit design as a new project">
            Open toolkit design…
          </button>
        )}
      </div>

      {project && toolkit && (
        <div className="sgl-project-actions sgl-project-toolkit" role="group" aria-label="Toolkit" data-project-toolkit>
          <p className="meta">
            Toolkit: <strong>{toolkit.name ?? 'none'}</strong>
            {toolkit.uploaded && ' (uploaded)'}
          </p>
          {toolkit.name === null && onAddToolkit && (
            <button type="button" onClick={onAddToolkit} aria-haspopup="dialog" title="Give this project a toolkit: one from this app or your own zip">
              {ADD_TOOLKIT_LABEL}
            </button>
          )}
          {onUploadToolkit && (
            <label className="file-button" title={toolkit.uploaded ? 'A new version of this toolkit replaces it; another toolkit opens as a new project' : 'Your own toolkit, zipped, as a new project'}>
              {UPLOAD_TOOLKIT_LABEL}
              <input
                type="file"
                accept=".zip,application/zip"
                aria-label={UPLOAD_TOOLKIT_LABEL}
                onChange={(e) => {
                  const file = chosenFile(e);
                  if (file) onUploadToolkit(file);
                }}
              />
            </label>
          )}
          {onDownloadToolkit && (
            <button type="button" onClick={onDownloadToolkit} title="Save the toolkit as <name>.zip, the folder with toolkit.ts directly inside (the hand-in shape)">
              {DOWNLOAD_TOOLKIT_LABEL}
            </button>
          )}
        </div>
      )}

      {running && (
        <p className="meta" role="status">
          {running}
        </p>
      )}

      {examplesOpen && loadExamples && onOpenExample && (
        <OpenExampleDialog
          load={loadExamples}
          onCancel={() => setExamplesOpen(false)}
          onOpen={(choice) => {
            setExamplesOpen(false);
            onOpenExample(choice);
          }}
        />
      )}

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

      {exportOpen && controller && (
        <Dialog
          title="Export"
          lead="Choose what to download."
          onClose={() => setExportOpen(false)}
          dialogId="export"
          footer={
            <button type="button" onClick={() => setExportOpen(false)}>
              Cancel
            </button>
          }
        >
          <div className="sgl-choice-list" role="group" aria-label="What to export">
            <button
              type="button"
              className="sgl-choice"
              data-autofocus
              data-choice="design"
              onClick={() => {
                setExportOpen(false);
                setMessage(exportDesign(controller));
              }}
            >
              <span className="sgl-choice-title">Design file (.json)</span>
              <span className="sgl-choice-text">This scenario’s design only. Ready to put in your toolkit’s designs/ folder.</span>
            </button>
            <button
              type="button"
              className="sgl-choice"
              data-choice="project"
              onClick={() => {
                setExportOpen(false);
                setMessage(exportProject(controller));
              }}
            >
              <span className="sgl-choice-title">Project file (.project.json)</span>
              <span className="sgl-choice-text">The whole project: every scenario, the attributes and the settings.</span>
            </button>
          </div>
        </Dialog>
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
        <NewProjectDialog
          toolkits={toolkits}
          toolkitId={newToolkit}
          onToolkit={setNewToolkit}
          onCancel={() => setNewToolkit(undefined)}
          onCreate={() => {
            const chosen = newToolkit;
            setNewToolkit(undefined);
            onNew(chosen);
          }}
        />
      )}
    </div>
  );
}

/**
 * New project from the Project panel: Welcome's toolkit choice (`ToolkitPicker`, "No toolkit" by
 * default) and Create project, which takes the same path as Welcome's Create project (`onNew` →
 * `createProject`: with a toolkit, its custom attributes and an empty graph).
 */
export function NewProjectDialog({
  toolkits,
  toolkitId,
  onToolkit,
  onCancel,
  onCreate,
}: {
  readonly toolkits: readonly ToolkitOption[];
  readonly toolkitId: string | null;
  readonly onToolkit: (toolkitId: string | null) => void;
  readonly onCancel: () => void;
  readonly onCreate: () => void;
}) {
  return (
    <Dialog
      title="New project"
      lead="A new, empty project. This one stays saved in this browser."
      onClose={onCancel}
      dialogId="new-project"
      footer={
        <>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="sgl-primary" data-autofocus onClick={onCreate}>
            Create project
          </button>
        </>
      }
    >
      <ToolkitPicker toolkits={toolkits} value={toolkitId} onChange={onToolkit} />
    </Dialog>
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
