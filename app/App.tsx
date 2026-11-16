import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import exampleDesign from './document/examples/two-storey-example.json';
import { formatIssuePath, type GraphIssue, type Result } from '@app/document';
import { readDesign, readDesignJson, serializeDesignV2, type DesignDocumentV2 } from '@app/document/v2';
import { PROJECT_GLOBS, type AttributeCollection, type ExtensionDiagnostic, type TransformationPreviewV2 } from '@app/extensions';
import { proposeSpatialEdit, resolveRelationships, type DesignCommand, type DesignPort } from '@app/spatial';
import type { CommandOutcome, GraphCommandHandler } from '@app/views/contracts';
import { conciseIssues, presentAnalysis, type AnalysisPresentation } from '@app/views/presentation';
import { buildProjectViewContext, projectFacadeProvider } from '@app/views/project';
import { NO_SELECTION, reconcileSelection, selectEdge, type Selection } from '@core/viewer/selection';
import { AttributesPanel } from './attributes/AttributesPanel';
import { DesignerPanel } from './designer';
import { AlgorithmPanel } from './session/AlgorithmPanel';
import { applyPreviewV2, isStale, type AlgorithmRunV2, type ApplyOutcome } from './session/algorithmSession';
import {
  applyDesignCommandToSession,
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
import { designCommandFromLegacy, legacyProjection } from './session/legacyBridge';
import { ProjectPanel, projectStatus } from './session/ProjectPanel';
import { OpenAttributesContext } from './attributes/navigation';
import type { SidebarSection } from '@app/ui';
import {
  attributeDiagnostics,
  currentSchema,
  loadAttributeSession,
  persistAttributeSession,
  type AttributeSession,
  type KeyValueStorage,
} from './session/projectAttributeStore';
import {
  activeProjectOf,
  DISCARD_PROMPT,
  projectHeadline,
  readProjectRequest,
  searchWithProject,
  startProject,
  type ProjectSession,
  type ProjectStart,
} from './session/projectSession';
import { historyButtonTitle, historyShortcut, isApplePlatform, type HistoryShortcut } from './session/shortcuts';
import './session/session.css';
import { Workspace } from './Workspace';
import { DESTINATION_PANELS } from '@app/workspace/panelSlots';
import {
  browserPaneStorage,
  initialLeftCollapsed,
  initialRightPane,
  PANE_STORAGE_KEYS,
  readFlag,
  readLeftWidth,
  rightPaneOnSelection,
  userSetRightCollapsed,
  writeFlag,
  writeLeftWidth,
  type RightPaneState,
} from '@app/workspace/panes';
import { WorkspaceServicesContext, type WorkspaceServices } from '@app/workspace/services';
import { DEFAULT_VIEWPORT_STATE, deriveViewports, type ViewportState } from '@app/workspace/viewports';

/**
 * Application shell (Gate 1 integration). The app stores, edits, undoes and exports ONE schema-v2
 * document (`DesignDocumentV2`). v1 files (import, project designs, the built-in example) are read
 * with `readDesign*`, validated with the unchanged v1 rules and migrated; export writes v2 only.
 *
 * Every view, Properties and the Designer receive the same live `DesignPort` (`design`), built
 * once per document: `spatial` is resolved once, `onCommand` is the only way to change the
 * document and records exactly one history step per successful change. The frozen v1 `doc` /
 * `onCommand` props carry a read-only projection and a v1→v2 command translation (legacyBridge).
 */

const EXAMPLE_LABEL = 'app/document/examples/two-storey-example.json';

type Doc = DesignDocumentV2;

interface LoadFailureState {
  readonly source: string;
  readonly issues: readonly GraphIssue[];
}

interface State {
  /** The open document with its history and clean baseline; null when no design is open. */
  readonly current: DocumentSession<Doc> | null;
  readonly failure: LoadFailureState | null;
}

const noDesign: GraphIssue = { path: [], code: 'not-found', message: 'no design is loaded' };

/** Validated results only ever replace the current document (resetting its history); failures leave it untouched. */
function applyResult(prev: State, result: Result<{ readonly doc: Doc }>, source: string): State {
  return result.ok
    ? { current: openDocument(result.value.doc, source, prev.current), failure: null }
    : { ...prev, failure: { source, issues: result.issues } };
}

const loadExample = (prev: State): State => applyResult(prev, readDesign(exampleDesign), EXAMPLE_LABEL);

/** The built-in (v1) example, migrated: used when no project design is available. */
function builtInExample(): { readonly doc: Doc; readonly source: string } {
  const result = readDesign(exampleDesign);
  if (!result.ok) throw new Error(`the built-in example is invalid: ${result.issues.map((i) => i.message).join('; ')}`);
  return { doc: result.value.doc, source: EXAMPLE_LABEL };
}

/** File name for an exported design, derived from its metadata name. */
const exportFileName = (doc: Doc): string =>
  `${doc.metadata.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'design'}.json`;

/** Download the current document as canonical schema-v2 JSON (the same text `readDesignJson` accepts). */
function downloadDesign(doc: Doc): void {
  const url = URL.createObjectURL(new Blob([serializeDesignV2(doc)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = exportFileName(doc);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const APPLE = typeof navigator !== 'undefined' && isApplePlatform(navigator.platform);

/** Browser storage for the project attribute schema, or null when the browser refuses access. */
function browserStorage(): KeyValueStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * A design that could not be opened (Stage 07 concise feedback): one headline naming the file and
 * whether the current design was kept, at most three beginner lines, and the exact validator
 * messages and paths behind "More details".
 */
function LoadFailure({ failure, kept, onDismiss }: { readonly failure: LoadFailureState; readonly kept: boolean; readonly onDismiss: () => void }) {
  const feedback = conciseIssues(failure.issues, { action: `load ${failure.source}`, kept });
  return (
    <section className="issues sgl-load-failure" role="alert">
      <h2>{kept ? feedback.headline : `${feedback.headline} No design is loaded.`}</h2>
      <ul>
        {feedback.lines.map((l, n) => (
          <li key={n}>{l.hint}</li>
        ))}
      </ul>
      {feedback.more > 0 && <p className="meta">…and {feedback.more} more.</p>}
      <details>
        <summary>More details</summary>
        <pre className="issues-technical">
          {failure.issues.map((i) => `${formatIssuePath(i.path) || '(document)'} — ${i.message} (${i.code})`).join('\n')}
        </pre>
      </details>
      <button type="button" onClick={onDismiss}>
        Dismiss
      </button>
    </section>
  );
}

export function App() {
  const [state, setStateRaw] = useState<State>({ current: null, failure: null });
  /** null while a project is being activated. */
  const [session, setSession] = useState<ProjectSession | null>(null);
  /** Increments on every activation, to reset per-project panels. */
  const [generation, setGeneration] = useState(0);
  const [rawSelection, setSelection] = useState<Selection>(NO_SELECTION);
  /** The analysis run whose values are shown on the model (never part of the document). */
  const [shownAnalysis, setShownAnalysis] = useState<AlgorithmRunV2 | null>(null);
  /**
   * The active project's attribute schema in use (docs/PROJECT-ATTRIBUTES.md): project-scoped,
   * persisted in browser storage on every change, with its own undo history. null without project.
   */
  const [attributes, setAttributesRaw] = useState<AttributeSession | null>(null);
  const attributesRef = useRef(attributes);
  /** Last failure to save the schema (shown persistently), or null. */
  const [attributeSaveError, setAttributeSaveError] = useState<string | null>(null);
  /** Workspace rails (programme phase 04): owned here so the header and Properties can open a destination. */
  const [leftTab, setLeftTab] = useState<SidebarSection>('project');
  // An explicit, remembered collapse choice wins; otherwise narrow screens start with the left
  // content collapsed (rail only) so the views keep their width.
  const [leftCollapsed, setLeftCollapsed] = useState(() =>
    initialLeftCollapsed(readFlag(browserPaneStorage(), PANE_STORAGE_KEYS.leftCollapsed), typeof window === 'undefined' ? null : window.innerWidth),
  );
  const [leftWidth, setLeftWidth] = useState(() => readLeftWidth(browserPaneStorage()));
  /** Properties pane: a deliberate collapse is remembered; otherwise a new selection opens it. */
  const [rightPane, setRightPane] = useState<RightPaneState>(() => initialRightPane(readFlag(browserPaneStorage(), PANE_STORAGE_KEYS.rightCollapsed)));
  /** Centre viewports (layout 1/2/4, modes, maximise); owned here so WorkspaceServices can describe them. */
  const [viewports, setViewports] = useState<ViewportState>(DEFAULT_VIEWPORT_STATE);
  const [attributeCollection, setAttributeCollection] = useState<AttributeCollection>('nodes');
  const fileInput = useRef<HTMLInputElement>(null);
  const setAttributes = useCallback((next: AttributeSession | null, persist = true) => {
    attributesRef.current = next;
    setAttributesRaw(next);
    if (next && persist) setAttributeSaveError(persistAttributeSession(browserStorage(), next));
  }, []);
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
  /** Read-only v1-shaped projection for the frozen `ViewProps.doc` (identity-stable per document). */
  const viewDoc = doc ? legacyProjection(doc) : null;
  const selection = viewDoc ? reconcileSelection(rawSelection, viewDoc) : NO_SELECTION;
  const project = activeProjectOf(session);
  const facade = useMemo(() => projectFacadeProvider(project), [project]);
  const schema = attributes && project && attributes.projectId === project.id ? currentSchema(attributes) : undefined;
  const projectContext = useMemo(() => (doc ? buildProjectViewContext(project, doc, facade, schema) : undefined), [project, doc, facade, schema]);
  const attributesVersion = useMemo(() => (attributes && schema ? { schema, revision: attributes.revision } : undefined), [attributes, schema]);
  const modified = isModified(current);

  /** Shared selection handler: a node/edge selection opens Properties unless deliberately collapsed. */
  const select = useCallback((next: Selection) => {
    setSelection(next);
    if (next.kind !== 'none') setRightPane((pane) => rightPaneOnSelection(pane, true));
  }, []);

  /** Show an activation outcome: its design (or none), replacing the current one. Never runs algorithms. */
  const showStart = useCallback(
    (start: ProjectStart) => {
      setSession(start.session);
      const active = activeProjectOf(start.session);
      // Loading never writes: an untouched project leaves no stored record.
      setAttributes(active ? loadAttributeSession(browserStorage(), active) : null, false);
      setAttributeSaveError(null);
      setGeneration((g) => g + 1);
      setState((prev) => ({
        current: start.startup.doc ? openDocument(start.startup.doc, start.startup.source, prev.current) : null,
        failure: null,
      }));
      setSelection(NO_SELECTION);
      setShownAnalysis(null);
    },
    [setState, setAttributes],
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

  /** Loading a document replaces it wholesale; the selection and overlay are cleared only when it succeeds. */
  const load = (update: (prev: State) => State) => {
    const before = stateRef.current.current;
    if (setState(update).current !== before) {
      setSelection(NO_SELECTION);
      setShownAnalysis(null);
    }
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
    load((prev) => applyResult(prev, design.result.ok ? { ok: true, value: { doc: design.result.value } } : design.result, design.file));
  };

  /** Validate and apply one v2 command; a successful change is one history step, a no-op none. */
  const onDesignCommand = useCallback(
    (command: DesignCommand): CommandOutcome => {
      const open = stateRef.current.current;
      if (!open) return { ok: false, issues: [noDesign] };
      const outcome = applyDesignCommandToSession(open, command);
      if (!outcome.ok) return { ok: false, issues: outcome.issues };
      if (outcome.changed) setState((prev) => ({ ...prev, current: outcome.session }));
      return { ok: true };
    },
    [setState],
  );

  /** Frozen v1 command handler: translated to the v2 command, so it edits the same stored document. */
  const onCommand = useCallback<GraphCommandHandler>((command) => onDesignCommand(designCommandFromLegacy(command)), [onDesignCommand]);

  /** Pure move/resize preview against the LATEST document (a gizmo re-checks on release). */
  const proposeEdit = useCallback<DesignPort['proposeEdit']>((request) => {
    const open = stateRef.current.current;
    if (!open) return { status: 'rejected', issues: [noDesign], collidingRooms: [] };
    return proposeSpatialEdit(currentDocument(open), request);
  }, []);

  /** The one live port shared by Graph 2D, Graph 3D, Voxels, Building, Properties and Designer. */
  const port = useMemo<DesignPort | undefined>(
    () => (doc ? { doc, spatial: resolveRelationships(doc), onCommand: onDesignCommand, proposeEdit } : undefined),
    [doc, onDesignCommand, proposeEdit],
  );

  /** Services for destination panels (Scenarios, Camera, Display): read through `useWorkspaceServices()`. */
  const viewportInfos = useMemo(() => deriveViewports(viewports), [viewports]);
  const services = useMemo<WorkspaceServices>(
    () => ({ design: port ?? null, selection, onSelect: select, viewports: viewportInfos }),
    [port, selection, select, viewportInfos],
  );

  /** Apply an already-validated preview as one state replacement and one history step, unless stale or unconfirmed. */
  const onApplyPreview = useCallback(
    (preview: TransformationPreviewV2, ranAt: number, label: string, confirmed: boolean, attributesRevision?: number): ApplyOutcome<Doc> => {
      const open = stateRef.current.current;
      const schemaNow = attributesRef.current;
      if (attributesRevision !== undefined && schemaNow && schemaNow.revision !== attributesRevision) {
        return {
          ok: false,
          reason: 'stale',
          message: 'The project attributes have changed since this preview was computed, so it was not applied. Run the algorithm again.',
        };
      }
      const outcome = applyPreviewV2(open && versionOf(open), preview, ranAt, { confirmRouteDisplacement: confirmed });
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
      const nextDoc = legacyProjection(currentDocument(next));
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
    load((prev) => applyResult(prev, readDesignJson(text), file.name));
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

  /** Analysis overlay: rebuilt on every document change so a stale result is visibly marked. */
  const analysis = useMemo<AnalysisPresentation | null>(() => {
    if (!shownAnalysis || !doc || !version) return null;
    const outcome = shownAnalysis.outcome.ok && shownAnalysis.outcome.value.kind === 'analysis' ? shownAnalysis.outcome.value.result : null;
    if (!outcome) return null;
    return presentAnalysis({
      title: shownAnalysis.label,
      ...(outcome.summary !== undefined && { summary: outcome.summary }),
      nodeValues: outcome.nodeValues,
      ranOnNodeIds: shownAnalysis.doc.nodes.map((n) => n.id),
      currentNodeIds: doc.nodes.map((n) => n.id),
      stale: isStale(shownAnalysis, version, attributes?.revision),
      labelOf: new Map(doc.nodes.map((n) => [n.id, n.displayId ?? n.id] as const)),
    });
  }, [shownAnalysis, doc, version, attributes?.revision]);

  const undoable = current !== null && canUndo(current.history);
  const redoable = current !== null && canRedo(current.history);
  const undoTitle = historyButtonTitle('undo', undoable, current && undoLabel(current.history), APPLE);
  const redoTitle = historyButtonTitle('redo', redoable, current && redoLabel(current.history), APPLE);

  const conformance = projectContext?.conformance ?? [];
  const attributeProblems: readonly ExtensionDiagnostic[] = [
    ...(attributes ? attributeDiagnostics(attributes) : []),
    ...(attributeSaveError
      ? [{ id: 'attribute-save', code: 'attribute-schema-storage', severity: 'error', subject: { kind: 'project', id: project?.id ?? '' }, message: `project attributes were not saved: ${attributeSaveError}` } as const]
      : []),
  ];
  const status = projectStatus(session, conformance, attributeProblems);
  const openLeft = (tab: SidebarSection) => {
    setLeftTab(tab);
    setLeftCollapsed(false);
  };
  /** The user collapsed or opened the left pane: an explicit choice, remembered. */
  const onLeftCollapsed = (collapsed: boolean) => {
    setLeftCollapsed(collapsed);
    writeFlag(browserPaneStorage(), PANE_STORAGE_KEYS.leftCollapsed, collapsed);
  };
  const onLeftWidth = (width: number, done: boolean) => {
    setLeftWidth(width);
    if (done) writeLeftWidth(browserPaneStorage(), width);
  };
  /** The user collapsed or opened Properties (or asked to show something in it): remembered. */
  const setRightCollapsedByUser = (collapsed: boolean) => {
    setRightPane(userSetRightCollapsed(collapsed));
    writeFlag(browserPaneStorage(), PANE_STORAGE_KEYS.rightCollapsed, collapsed);
  };
  const openAttributes = (collection: AttributeCollection) => {
    setAttributeCollection(collection);
    openLeft('attributes');
  };
  const loadExampleDesign = () => confirmDiscard() && load(loadExample);
  const projectName = session === null ? 'Activating project…' : (project?.definition.name ?? projectHeadline(session, current !== null).title);
  const designName = doc?.metadata.name ?? null;

  return (
    <div className="app">
      <header className="toolbar">
        <h1>Spatial Graph Lab</h1>
        {/* Short identity; full paths, project switching and checks live in the Project section. */}
        <div className="project-bar sgl-identity" aria-label="Open project and design">
          <button type="button" className="sgl-identity-project" onClick={() => openLeft('project')} title="Project, designs, files and checks">
            {projectName}
          </button>
          {designName && (
            <>
              <span className="sgl-identity-sep" aria-hidden="true">
                /
              </span>
              <span className="sgl-identity-design" title={current?.source ?? undefined}>
                {designName}
              </span>
            </>
          )}
          {modified && (
            <span className="modified-badge" title="Changed since it was loaded or exported. Use Export JSON to keep it.">
              modified (not exported)
            </span>
          )}
          {status.problems > 0 && (
            <button type="button" className={`sgl-problem-badge ${status.errors > 0 ? 'error' : 'warning'}`} onClick={() => openLeft('project')} title="Show the problems in the Project section">
              {status.errors > 0 ? '✖' : '⚠'} {status.problems} {status.problems === 1 ? 'problem' : 'problems'}
            </button>
          )}
        </div>
        <div className="actions">
          <div className="history-actions" role="group" aria-label="Design edit history">
            <button type="button" disabled={!undoable} title={undoTitle} aria-label={undoTitle} onClick={() => navigate('undo')}>
              <span aria-hidden="true">↶</span> Undo
            </button>
            <button type="button" disabled={!redoable} title={redoTitle} aria-label={redoTitle} onClick={() => navigate('redo')}>
              <span aria-hidden="true">↷</span> Redo
            </button>
          </div>
          <button type="button" onClick={loadExampleDesign} title="Replace the open design with the built-in two-storey example">
            Load example
          </button>
          <label className="file-button" title="Open a design JSON file (schema v1 or v2) from your computer">
            Open JSON…
            <input ref={fileInput} type="file" accept=".json,application/json" onChange={onFile} />
          </label>
          <button type="button" disabled={!current} onClick={exportDesign} title="Download the open design as schema-v2 JSON">
            Export JSON
          </button>
        </div>
      </header>

      <main>
        {failure && (
          <LoadFailure failure={failure} kept={current !== null} onDismiss={() => setState((s) => ({ ...s, failure: null }))} />
        )}

        <WorkspaceServicesContext.Provider value={services}>
        <OpenAttributesContext.Provider value={project ? openAttributes : null}>
          <Workspace
            view={
              doc && viewDoc && port
                ? { doc: viewDoc, design: port, selection, onSelect: select, onCommand, ...(projectContext && { project: projectContext }) }
                : null
            }
            leftTab={leftTab}
            onLeftTab={setLeftTab}
            leftCollapsed={leftCollapsed}
            onLeftCollapsed={onLeftCollapsed}
            leftWidth={leftWidth}
            onLeftWidth={onLeftWidth}
            rightCollapsed={rightPane.collapsed}
            onRightCollapsed={setRightCollapsedByUser}
            viewports={viewports}
            onViewports={setViewports}
            analysis={analysis}
            onClearAnalysis={() => setShownAnalysis(null)}
            empty={
              <p className="meta">
                No design is open. {session ? 'See the Project section for the reason, or load the example.' : 'Activating project…'}
              </p>
            }
            sections={{
              project: (
                <ProjectPanel
                  session={session}
                  docLoaded={current !== null}
                  source={current?.source ?? null}
                  designName={designName}
                  modified={modified}
                  conformance={conformance}
                  attributeProblems={attributeProblems}
                  onSwitchProject={(id) => void switchProject(id)}
                  onOpenDesign={openProjectDesign}
                  onSelect={select}
                  onLoadExample={loadExampleDesign}
                  onOpenFile={() => fileInput.current?.click()}
                  onExport={exportDesign}
                />
              ),
              attributes: (
                <AttributesPanel
                  session={attributes}
                  project={project}
                  doc={doc}
                  source={current?.source ?? null}
                  onChange={(next) => setAttributes(next)}
                  saveError={attributeSaveError}
                  collection={attributeCollection}
                  onCollection={setAttributeCollection}
                />
              ),
              designer: port ? (
                <DesignerPanel
                  design={port}
                  {...(projectContext && { project: projectContext })}
                  selection={selection}
                  onShowRelationship={(edgeId) => {
                    setSelection(selectEdge(edgeId));
                    setRightCollapsedByUser(false);
                  }}
                />
              ) : (
                <p className="meta">Open a design to change its appearance.</p>
              ),
              algorithms: (
                <AlgorithmPanel
                  key={`${project?.id ?? '-'}:${generation}`}
                  project={project}
                  version={version}
                  onApply={onApplyPreview}
                  onSelect={select}
                  shownAnalysis={shownAnalysis}
                  onShowAnalysis={setShownAnalysis}
                  {...(attributesVersion && { attributes: attributesVersion })}
                />
              ),
              // Panel slots (Gate F): workstreams own the component bodies, the registry owns the map.
              scenarios: <DESTINATION_PANELS.scenarios />,
              camera: <DESTINATION_PANELS.camera />,
              display: <DESTINATION_PANELS.display />,
            }}
          />
        </OpenAttributesContext.Provider>
        </WorkspaceServicesContext.Provider>
      </main>
    </div>
  );
}
