import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import exampleDesign from './document/examples/two-storey-example.json';
import {
  formatIssuePath,
  parseDesignJson,
  serializeDesign,
  validateDocument,
  type DesignDocument,
  type GraphIssue,
  type Result,
} from '@app/document';
import { PROJECT_GLOBS, type TransformationPreview } from '@app/extensions';
import type { GraphCommandHandler } from '@app/views/contracts';
import { buildProjectViewContext, projectFacadeProvider } from '@app/views/project';
import { NO_SELECTION, reconcileSelection, type Selection } from '@core/viewer/selection';
import { AlgorithmPanel } from './session/AlgorithmPanel';
import { applyPreview, type ApplyOutcome } from './session/algorithmSession';
import {
  applyCommand,
  commitDocument,
  currentDocument,
  isModified,
  markExported,
  openDocument,
  redoDocument,
  undoDocument,
  versionOf,
  type DocumentSession,
} from './session/documentSession';
import { canRedo, canUndo, redoLabel, undoLabel } from './session/history';
import { ProjectBar } from './session/ProjectBar';
import {
  activeProjectOf,
  DISCARD_PROMPT,
  readProjectRequest,
  searchWithProject,
  startProject,
  type ProjectSession,
  type ProjectStart,
} from './session/projectSession';
import { historyButtonTitle, historyShortcut, isApplePlatform, type HistoryShortcut } from './session/shortcuts';
import './session/session.css';
import { Workspace } from './Workspace';

const EXAMPLE_LABEL = 'app/document/examples/two-storey-example.json';

interface LoadFailure {
  readonly source: string;
  readonly issues: readonly GraphIssue[];
}

interface State {
  /** The open document with its history and clean baseline; null when no design is open. */
  readonly current: DocumentSession | null;
  readonly failure: LoadFailure | null;
}

/** Validated results only ever replace the current document (resetting its history); failures leave it untouched. */
function applyResult(prev: State, result: Result<DesignDocument>, source: string): State {
  return result.ok
    ? { current: openDocument(result.value, source, prev.current), failure: null }
    : { ...prev, failure: { source, issues: result.issues } };
}

const loadExample = (prev: State): State => applyResult(prev, validateDocument(exampleDesign), EXAMPLE_LABEL);

/** The built-in example, used when no project design is available. */
function builtInExample(): { readonly doc: DesignDocument; readonly source: string } {
  const result = validateDocument(exampleDesign);
  if (!result.ok) throw new Error(`the built-in example is invalid: ${result.issues.map((i) => i.message).join('; ')}`);
  return { doc: result.value, source: EXAMPLE_LABEL };
}

/** File name for an exported design, derived from its metadata name. */
const exportFileName = (doc: DesignDocument): string =>
  `${doc.metadata.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'design'}.json`;

/** Download the current document as canonical JSON (the same text `parseDesignJson` accepts). */
function downloadDesign(doc: DesignDocument): void {
  const url = URL.createObjectURL(new Blob([serializeDesign(doc)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = exportFileName(doc);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const APPLE = typeof navigator !== 'undefined' && isApplePlatform(navigator.platform);

export function App() {
  const [state, setStateRaw] = useState<State>({ current: null, failure: null });
  /** null while a project is being activated. */
  const [session, setSession] = useState<ProjectSession | null>(null);
  /** Increments on every activation, to reset per-project panels. */
  const [generation, setGeneration] = useState(0);
  const [rawSelection, setSelection] = useState<Selection>(NO_SELECTION);
  // Mirror of the latest state so command handlers can validate synchronously against it. Every
  // transition is computed here, outside React's updater functions, and handed to React as a
  // value: nothing runs twice under StrictMode and no updater has side effects.
  const stateRef = useRef(state);
  const setState = useCallback((update: (prev: State) => State) => {
    const next = update(stateRef.current);
    stateRef.current = next;
    setStateRaw(next);
    return next;
  }, []);

  const { current, failure } = state;
  const doc = current ? currentDocument(current) : null;
  const version = useMemo(() => (current ? versionOf(current) : null), [current]);
  const selection = doc ? reconcileSelection(rawSelection, doc) : NO_SELECTION;
  const project = activeProjectOf(session);
  const facade = useMemo(() => projectFacadeProvider(project), [project]);
  const projectContext = useMemo(() => (doc ? buildProjectViewContext(project, doc, facade) : undefined), [project, doc, facade]);
  const modified = isModified(current);

  /** Show an activation outcome: its design (or none), replacing the current one. Never runs algorithms. */
  const showStart = useCallback(
    (start: ProjectStart) => {
      setSession(start.session);
      setGeneration((g) => g + 1);
      setState((prev) => ({
        current: start.startup.doc ? openDocument(start.startup.doc, start.startup.source, prev.current) : null,
        failure: null,
      }));
      setSelection(NO_SELECTION);
    },
    [setState],
  );

  // Activate the project selected by `?project=` / VITE_SGL_PROJECT once, at startup.
  useEffect(() => {
    let cancelled = false;
    const env = import.meta.env['VITE_SGL_PROJECT'] as string | undefined;
    void startProject(PROJECT_GLOBS, readProjectRequest(window.location.search, env), builtInExample()).then((start) => {
      if (!cancelled) showStart(start);
    });
    return () => {
      cancelled = true;
    };
  }, [showStart]);

  /** Unsaved changes are never discarded silently. */
  const confirmDiscard = () => !isModified(stateRef.current.current) || window.confirm(DISCARD_PROMPT);

  /** Loading a document replaces it wholesale; the selection is cleared only when it succeeds. */
  const load = (update: (prev: State) => State) => {
    const before = stateRef.current.current;
    if (setState(update).current !== before) setSelection(NO_SELECTION);
  };

  const switchProject = async (projectId: string) => {
    if (!confirmDiscard()) return;
    // The URL records the choice, so reloading the page keeps the same project.
    window.history.replaceState(null, '', searchWithProject(window.location.search, projectId));
    setSession(null);
    showStart(await startProject(PROJECT_GLOBS, { query: projectId }, builtInExample()));
  };

  const openProjectDesign = (designId: string) => {
    const design = project?.designs.find((d) => d.id === designId);
    if (!design || !confirmDiscard()) return;
    load((prev) => applyResult(prev, design.result, design.file));
  };

  /** Validate and apply one command; a successful change is one history step, a no-op none. */
  const onCommand = useCallback<GraphCommandHandler>(
    (command) => {
      const open = stateRef.current.current;
      if (!open) return { ok: false, issues: [{ path: [], code: 'not-found', message: 'no design is loaded' }] };
      const outcome = applyCommand(open, command);
      if (!outcome.ok) return { ok: false, issues: outcome.issues };
      if (outcome.changed) setState((prev) => ({ ...prev, current: outcome.session }));
      return { ok: true };
    },
    [setState],
  );

  /** Apply an already-validated preview as one state replacement and one history step, unless it is stale. */
  const onApplyPreview = useCallback(
    (preview: TransformationPreview, ranAt: number, label: string): ApplyOutcome => {
      const open = stateRef.current.current;
      const outcome = applyPreview(open && versionOf(open), preview, ranAt);
      if (outcome.ok && open) setState((prev) => ({ ...prev, current: commitDocument(open, outcome.doc, `Apply “${label}”`) }));
      return outcome;
    },
    [setState],
  );

  /** Undo or redo one document step. Selection is reconciled; cameras and layout are untouched. */
  const navigate = useCallback(
    (action: HistoryShortcut) => {
      const open = stateRef.current.current;
      if (!open) return;
      const next = action === 'undo' ? undoDocument(open) : redoDocument(open);
      if (next === open) return;
      setState((prev) => ({ ...prev, current: next }));
      const nextDoc = currentDocument(next);
      setSelection((sel) => reconcileSelection(sel, nextDoc));
    },
    [setState],
  );

  // Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y, except inside text fields (native text undo).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = historyShortcut(event, event.target as Partial<HTMLElement> | null);
      if (!action) return;
      event.preventDefault();
      navigate(action);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const text = await file.text();
    if (!confirmDiscard()) return;
    load((prev) => applyResult(prev, parseDesignJson(text), file.name));
  }

  /** The exported content becomes the clean state, only once the download was started successfully. */
  const exportDesign = () => {
    const open = stateRef.current.current;
    if (!open) return;
    const exported = currentDocument(open);
    try {
      downloadDesign(exported);
    } catch (error) {
      window.alert(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    setState((prev) => (prev.current ? { ...prev, current: markExported(prev.current, exported) } : prev));
  };

  const undoable = current !== null && canUndo(current.history);
  const redoable = current !== null && canRedo(current.history);
  const undoTitle = historyButtonTitle('undo', undoable, current && undoLabel(current.history), APPLE);
  const redoTitle = historyButtonTitle('redo', redoable, current && redoLabel(current.history), APPLE);

  return (
    <div className="app">
      <header className="toolbar">
        <h1>Spatial Graph Lab</h1>
        <div className="actions">
          <div className="history-actions" role="group" aria-label="Edit history">
            <button type="button" disabled={!undoable} title={undoTitle} aria-label={undoTitle} onClick={() => navigate('undo')}>
              <span aria-hidden="true">↶</span> Undo
            </button>
            <button type="button" disabled={!redoable} title={redoTitle} aria-label={redoTitle} onClick={() => navigate('redo')}>
              <span aria-hidden="true">↷</span> Redo
            </button>
          </div>
          <button type="button" onClick={() => confirmDiscard() && load(loadExample)}>
            Load example
          </button>
          <label className="file-button">
            Open JSON…
            <input type="file" accept=".json,application/json" onChange={onFile} />
          </label>
          <button type="button" disabled={!current} onClick={exportDesign}>
            Export JSON
          </button>
        </div>
      </header>

      <main>
        <ProjectBar
          session={session}
          docLoaded={current !== null}
          source={current?.source ?? null}
          modified={modified}
          conformance={projectContext?.conformance ?? []}
          onSwitchProject={(id) => void switchProject(id)}
          onOpenDesign={openProjectDesign}
          onSelect={setSelection}
        />

        {failure && (
          <section className="issues" role="alert">
            <h2>
              Could not load <code>{failure.source}</code>
            </h2>
            <p>{current ? 'The current design was kept unchanged.' : 'No design is loaded.'}</p>
            <ul>
              {failure.issues.map((i, n) => (
                <li key={n}>
                  <code>{formatIssuePath(i.path)}</code> — {i.message} <span className="code">({i.code})</span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setState((s) => ({ ...s, failure: null }))}>
              Dismiss
            </button>
          </section>
        )}

        {doc && (
          <Workspace
            doc={doc}
            selection={selection}
            onSelect={setSelection}
            onCommand={onCommand}
            {...(projectContext && { project: projectContext })}
            algorithms={
              <AlgorithmPanel
                key={`${project?.id ?? '-'}:${generation}`}
                project={project}
                version={version}
                onApply={onApplyPreview}
                onSelect={setSelection}
              />
            }
          />
        )}
      </main>
    </div>
  );
}
