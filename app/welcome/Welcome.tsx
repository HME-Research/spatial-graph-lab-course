import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
import { domFocusScope, handleDialogKeyDown } from '@app/ui/concepts/dialogKeys';
import { useGuide } from '@app/ui/guide';
import { ToolkitPicker, type ToolkitOption } from './ToolkitPicker';
import { OpenExampleDialog } from './OpenExampleDialog';
import { recentRows, type ExampleChoice, type ExampleOption, type RecentState } from './welcomeModel';
import './welcome.css';

export interface WelcomeProps {
  readonly recent: RecentState;
  /** Shown while an action runs (e.g. "Opening project…"); disables the actions. */
  readonly busy?: string | null;
  /** A failure of the last action (e.g. a file that could not be opened). */
  readonly error?: ReactNode;
  /** Toolkits a new project can start from (`toolkits/<id>`), and the preselected one. */
  readonly toolkits?: readonly ToolkitOption[];
  readonly defaultToolkitId?: string | null;
  /**
   * Create project: a clean project at once with the chosen toolkit (no name form; owner
   * 2026-11-17). The toolkit is chosen beside the button (owner 2026-11-17, toolkit terminology).
   */
  readonly onCreate: (toolkitId: string | null) => void;
  readonly onOpenFile: (file: File) => void;
  /**
   * Open example… (owner decision 2026-11-20): the examples to list (loaded when the dialog opens)
   * and what to do with the chosen one. Both absent: the button is not shown.
   */
  readonly loadExamples?: () => Promise<readonly ExampleOption[]>;
  readonly onOpenExample?: (choice: ExampleChoice) => void;
  readonly onRestore: (projectId: string) => void;
  /** Explicit user decision, confirmed here: delete an unreadable stored record (a copy is kept aside). */
  readonly onDiscardUnreadable: (projectId: string) => void;
}

/**
 * Welcome (UI refinement 2026-11-17): a modal overlay on top of the application shell, shown at
 * every startup — a stored project is never reopened automatically. The shell behind it is empty
 * and inert (the modal makes it so; nothing is created or saved to draw it).
 *
 * Entry actions (Create project, the strongest; Open project; Open example…, which lists
 * the built-in example and every toolkit design, owner 2026-11-20), then the projects
 * saved in this browser (name, scenarios, last edited), with a short note on where they are stored.
 * Keyboard: focus starts on Create project; Tab stays inside; Escape does nothing (there is nothing
 * behind Welcome to return to).
 */
export function Welcome({
  recent,
  busy = null,
  error = null,
  toolkits = [],
  defaultToolkitId = null,
  onCreate,
  onOpenFile,
  loadExamples,
  onOpenExample,
  onRestore,
  onDiscardUnreadable,
}: WelcomeProps) {
  const disabled = busy !== null;
  const [examplesOpen, setExamplesOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const guideButton = useRef<HTMLButtonElement>(null);
  const [toolkitId, setToolkitId] = useState<string | null>(defaultToolkitId);
  const guide = useGuide();

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

  /*
   * The Guide is a non-modal floating window, and nothing can sit above a modal <dialog>. So while
   * the Guide is open, Welcome becomes a non-modal dialog (with its own scrim, see welcome.css) and
   * the Guide floats above it; when the Guide closes, Welcome is modal again and gets focus back.
   */
  useEffect(() => {
    const el = dialog.current;
    if (!el || typeof el.showModal !== 'function' || typeof el.show !== 'function') return;
    let modal: boolean;
    try {
      modal = el.matches(':modal');
    } catch {
      return; // no :modal support: keep Welcome as it is
    }
    if (guide.isOpen && el.open && modal) {
      el.close();
      el.show();
    } else if (!guide.isOpen && el.open && !modal) {
      el.close();
      el.showModal();
      guideButton.current?.focus();
    }
  }, [guide.isOpen]);

  const onFile =(event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (file) onOpenFile(file);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
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
    <>
    {guide.isOpen && <div className="sgl-welcome-scrim" aria-hidden="true" />}
    <dialog ref={dialog} className={`sgl-welcome${guide.isOpen ? ' is-guide-open' : ''}`} aria-labelledby="sgl-welcome-title" aria-describedby="sgl-welcome-lead" onKeyDown={onKeyDown} onCancel={(e) => e.preventDefault()}>
      <div className="sgl-welcome-card">
        <header className="sgl-welcome-head">
          <button
            ref={guideButton}
            type="button"
            className="sgl-guide-button sgl-welcome-guide"
            onClick={() => guide.open()}
            aria-haspopup="dialog"
            aria-expanded={guide.isOpen}
            title="Open the Guide"
          >
            Guide
          </button>
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
            <div className="sgl-welcome-actions">
              <button type="button" className="sgl-welcome-action is-primary" data-autofocus onClick={() => onCreate(toolkitId)} disabled={disabled}>
                <span className="sgl-welcome-action-title">Create project</span>
                <span className="sgl-welcome-action-sub">Start from an empty graph</span>
              </button>
              <label className={`sgl-welcome-action file-button${disabled ? ' is-disabled' : ''}`}>
                <span className="sgl-welcome-action-title">Open project</span>
                <span className="sgl-welcome-action-sub">A project file from your computer</span>
                <input type="file" accept=".json,application/json" onChange={onFile} disabled={disabled} aria-label="Open project" />
              </label>
              {loadExamples && onOpenExample && (
                <button type="button" className="sgl-welcome-action" onClick={() => setExamplesOpen(true)} disabled={disabled} aria-haspopup="dialog">
                  <span className="sgl-welcome-action-title">Open example…</span>
                  <span className="sgl-welcome-action-sub">The example house or a toolkit’s designs</span>
                </button>
              )}
            </div>
            {toolkits.length > 0 && <ToolkitPicker toolkits={toolkits} value={toolkitId} onChange={setToolkitId} disabled={disabled} />}
        </section>

        <section className="sgl-welcome-recent" aria-labelledby="sgl-welcome-recent-title">
          <h3 id="sgl-welcome-recent-title">Recent projects</h3>
          <RecentList recent={recent} disabled={disabled} onRestore={onRestore} onDiscardUnreadable={onDiscardUnreadable} />
          <p className="sgl-help sgl-welcome-storage-note">Projects are saved in this browser. Export a project for a portable copy.</p>
        </section>
      </div>
    </dialog>
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
    </>
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
