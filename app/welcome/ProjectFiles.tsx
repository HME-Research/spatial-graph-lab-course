import { useState, type ChangeEvent } from 'react';
import { MAX_NAME_LENGTH } from '@app/session/projectStore';
import type { ProjectController } from '@app/session/projectStoreController';
import { useProjectControllerState } from '@app/session/projectStoreContext';
import { projectFileName } from './welcomeModel';
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
 * Export the open project (every scenario, the attribute record and settings) as one JSON file.
 * The exported state becomes "exported" only after the download was started. Returns an error
 * message, or null.
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
 * "Project Files" actions for the Project panel (workstream B; mounted by the shell inside the
 * A-styled Project panel): New, Open, Export Project, Save As New Project. New and Open are host
 * callbacks (New shows the Welcome screen's Create; Open validates a file and reports failures in
 * the shell); Export and Save As run on the controller.
 */
export function ProjectFiles({
  controller,
  onNew,
  onOpenFile,
}: {
  readonly controller: ProjectController | null;
  readonly onNew: () => void;
  readonly onOpenFile: (file: File) => void;
}) {
  const state = useProjectControllerState(controller);
  const project = state.project;
  const [saveAsName, setSaveAsName] = useState<string | null>(null);
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
      <div className="sgl-buttons">
        <button type="button" onClick={onNew} title="Start another project (this one stays saved in this browser)">
          New
        </button>
        <label className="file-button" title="Open a project file, or a design file as a new project">
          Open…
          <input type="file" accept=".json,application/json" onChange={onFile} aria-label="Open a project or design file" />
        </label>
        <button
          type="button"
          disabled={!project || !controller}
          onClick={() => controller && setMessage(exportProject(controller))}
          title="Download the whole project — every scenario, the attribute fields and settings — as one JSON file"
        >
          Export Project
        </button>
        <button type="button" disabled={!project} onClick={() => project && setSaveAsName(`${project.meta.name} copy`)} title="Continue in an independent copy of this project">
          Save As New Project
        </button>
      </div>
      {saveAsName !== null && controller && (
        <form
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
          <label className="sgl-form-row">
            Name of the new project
            <input type="text" value={saveAsName} maxLength={MAX_NAME_LENGTH} autoFocus onChange={(e) => setSaveAsName(e.currentTarget.value)} disabled={busy} />
          </label>
          <p className="sgl-help">The copy gets every scenario and the attribute fields. This project stays as it is, saved in this browser.</p>
          <div className="sgl-buttons">
            <button type="submit" className="primary" disabled={busy}>
              Save copy
            </button>
            <button type="button" onClick={() => setSaveAsName(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {message && (
        <p className="sgl-project-files-error" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}

/** Project name (rename) for the Project panel's Information section (workstream B helper). */
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
    <div className="sgl-project-files">
      <label className="sgl-form-row">
        Project name
        <input
          type="text"
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
      </label>
      {error && (
        <p className="sgl-project-files-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
