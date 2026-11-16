import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import exampleDesign from './document/examples/two-storey-example.json';
import { formatIssuePath, type GraphIssue } from '@app/document';
import { readDesign, serializeDesignV2, type DesignDocumentV2 } from '@app/document/v2';
import {
  discoverProjects,
  PROJECT_GLOBS,
  selectProject,
  type AttributeCollection,
  type ExtensionDiagnostic,
  type TransformationPreviewV2,
} from '@app/extensions';
import { createIndexedDbProjectStore, type ProjectIssue } from '@app/project';
import { proposeSpatialEdit, resolveWithPreferences, type DesignCommand, type DesignPort } from '@app/spatial';
import type { CommandOutcome, GraphCommandHandler } from '@app/views/contracts';
import { conciseIssues, presentAnalysis, type AnalysisPresentation } from '@app/views/presentation';
import { buildProjectViewContext, projectFacadeProvider } from '@app/views/project';
import { NO_SELECTION, reconcileSelection, selectEdge, type Selection } from '@core/viewer/selection';
import { createCameraBus } from '@core/viewer/three/camera';
import { AttributesPanel } from './attributes/AttributesPanel';
import { DesignerPanel } from './designer';
import { SaveStatus } from './scenarios/SaveStatus';
import { AlgorithmPanel } from './session/AlgorithmPanel';
import { applyPreviewV2, isStale, type AlgorithmRunV2, type ApplyOutcome } from './session/algorithmSession';
import { currentDocument, type DocumentVersion } from './session/documentSession';
import { canRedo, canUndo, createHistory, redoLabel, undoLabel } from './session/history';
import { designCommandFromLegacy, legacyProjection } from './session/legacyBridge';
import { ProjectPanel, projectStatus } from './session/ProjectPanel';
import { OpenAttributesContext } from './attributes/navigation';
import type { SidebarSection } from '@app/ui';
import {
  attributeDiagnostics,
  currentSchema,
  differsFromFiles,
  exportAttributeFile,
  importAttributeFile,
  loadAttributeSession,
  type AttributeSession,
  type KeyValueStorage,
} from './session/projectAttributeStore';
import { activeProjectOf, readProjectRequest, startProject, type ProjectSession } from './session/projectSession';
import { activeSession, activeSlot, isExported } from './session/projectStore';
import { createProjectController, showsWelcome, type LeaveOptions } from './session/projectStoreController';
import { ProjectControllerContext, useProjectControllerState } from './session/projectStoreContext';
import { historyButtonTitle, historyShortcut, isApplePlatform, type HistoryShortcut } from './session/shortcuts';
import './session/session.css';
import { ProjectFiles, ProjectNameField } from './welcome/ProjectFiles';
import { Welcome } from './welcome/Welcome';
import { createProject, openProjectText, tryExample, type FlowOutcome, type WelcomeHost } from './welcome/welcomeFlow';
import { recentStateOf, type RecentState } from './welcome/welcomeModel';
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
import { SavedCamerasProvider, UNBOUND_SCENARIO_ID } from '@app/camera/savedCameras';
import { DisplayProvider } from '@app/display/DisplayProvider';
import { DEFAULT_VIEWPORT_STATE, deriveViewports, type ViewportState } from '@app/workspace/viewports';

/**
 * Application shell. A LOCAL PROJECT (workstream B, `app/session/projectStoreController.ts`) is
 * open: several scenarios, each a complete schema-v2 design alternative with its own undo history
 * (`DocumentSession<ScenarioContent>`, design + face preferences), autosaved to IndexedDB. The
 * Welcome screen is always shown at startup; nothing is reopened automatically.
 *
 * Every view, Properties and the Designer receive the same live `DesignPort` (`design`) of the
 * ACTIVE scenario: `spatial` is resolved once per content with its face preferences, `onCommand`
 * is the only way to change it and records exactly one history step per successful change. The
 * code project (`projects/<id>`) named by the local project's `definition` supplies types and
 * algorithms. The frozen v1 `doc` / `onCommand` props carry a read-only projection and a v1→v2
 * command translation (legacyBridge).
 */

const EXAMPLE_LABEL = 'app/document/examples/two-storey-example.json';

type Doc = DesignDocumentV2;

interface LoadFailureState {
  readonly source: string;
  readonly issues: readonly GraphIssue[];
}

const noDesign: GraphIssue = { path: [], code: 'not-found', message: 'no design is loaded' };

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

/**
 * An empty key-value store: `loadAttributeSession` then yields the code project files' schema.
 * Local projects carry their attribute record in their own project file instead.
 */
const NO_STORAGE: KeyValueStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };

/** The browser's localStorage, used READ-ONLY to seed new projects from pre-project attribute schemas. */
function legacyBrowserStorage(): KeyValueStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Project-file issues share the `{path, code, message}` shape; unknown codes get the generic hint. */
const asGraphIssues = (issues: readonly ProjectIssue[]): readonly GraphIssue[] => issues as unknown as readonly GraphIssue[];

/**
 * A file that could not be opened (Stage 07 concise feedback): one headline naming the file and
 * whether the current project was kept, at most three beginner lines, and the exact validator
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

/** Code projects available for new projects, and the default one (`?project=` / VITE_SGL_PROJECT / example-gallery). */
function definitionChoices() {
  const ids = discoverProjects(PROJECT_GLOBS).projects.map((p) => p.id);
  const env = import.meta.env['VITE_SGL_PROJECT'] as string | undefined;
  const selected = selectProject(ids, readProjectRequest(typeof window === 'undefined' ? '' : window.location.search, env));
  return { ids, defaultId: selected.diagnostic ? (ids[0] ?? null) : selected.id };
}

export function App() {
  /** The local project controller: one per App instance, IndexedDB-backed. */
  const [controller] = useState(() => createProjectController({ store: createIndexedDbProjectStore() }));
  const cstate = useProjectControllerState(controller);
  const openProject = cstate.project;
  const [failure, setFailure] = useState<LoadFailureState | null>(null);
  /** Welcome: shown whenever no project is open; `create` opens with the Create form. */
  const [welcomeMode, setWelcomeMode] = useState<{ readonly startWith: 'choices' | 'create'; readonly definitionId: string | null } | null>(null);
  const [recent, setRecent] = useState<RecentState>({ status: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);
  const [definitions] = useState(definitionChoices);
  /** Activation of the open project's code project; null while activating or without project. */
  const [session, setSession] = useState<ProjectSession | null>(null);
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

  const definitionId = openProject?.meta.definition?.projectId ?? null;
  const projectId = openProject?.meta.projectId ?? null;
  const scenarioId = openProject?.activeScenarioId ?? null;

  /**
   * A user change of the schema: carried in the LOCAL project file (autosaved with the project),
   * so each local project keeps its own fields, also when several use the same code project.
   */
  const setAttributes = useCallback(
    (next: AttributeSession | null, persist = true) => {
      attributesRef.current = next;
      setAttributesRaw(next);
      if (next && persist) {
        setAttributeSaveError(null);
        const open = controller.getState().project;
        if (open && (open.meta.definition?.projectId ?? null) === next.projectId) {
          controller.setAttributeRecord(differsFromFiles(next) ? (JSON.parse(exportAttributeFile(next)) as unknown) : null);
        }
      }
    },
    [controller],
  );

  // Activate the open project's code project (types, algorithms) whenever the project changes.
  useEffect(() => {
    if (projectId === null) {
      setSession(null);
      setAttributes(null, false);
      return;
    }
    let cancelled = false;
    setSession(null);
    void startProject(PROJECT_GLOBS, { query: definitionId, env: null }, builtInExample()).then((start) => {
      if (cancelled) return;
      setSession(start.session);
      const active = activeProjectOf(start.session);
      setAttributeSaveError(null);
      if (!active) {
        setAttributes(null, false);
        return;
      }
      // The schema in use is the LOCAL project's own record, else the code project's files. The
      // browser copy (keyed by code project, shared by every local project using it) is not read.
      const fromFiles = loadAttributeSession(NO_STORAGE, active);
      const record = controller.getState().project?.meta.attributes ?? null;
      if (record === null) {
        setAttributes(fromFiles, false);
        return;
      }
      const imported = importAttributeFile(fromFiles, JSON.stringify(record), { allowOtherProject: true });
      if (imported.ok) {
        // Opening is not an edit: the project's schema starts a fresh attribute history.
        setAttributes({ ...imported.session, history: createHistory(imported.session.history.present) }, false);
      } else {
        setAttributes(fromFiles, false);
        setAttributeSaveError(`the project’s attribute fields could not be read, so the project files’ fields are shown: ${imported.issues.map((i) => i.message).join('; ')}`);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, definitionId, controller, setAttributes]);

  // A different project or scenario: per-design panels reset, selection and overlay cleared.
  const generation = `${projectId ?? '-'}:${scenarioId ?? '-'}`;
  useEffect(() => {
    setSelection(NO_SELECTION);
    setShownAnalysis(null);
  }, [generation]);

  // Welcome lists the projects stored in this browser (refreshed each time it is shown).
  const welcome = showsWelcome(cstate);
  useEffect(() => {
    if (!welcome) return;
    let cancelled = false;
    setRecent({ status: 'loading' });
    void controller.listRecent().then((list) => {
      if (!cancelled) setRecent(recentStateOf(list));
    });
    return () => {
      cancelled = true;
    };
  }, [welcome, controller]);

  // Leaving the page: write pending changes; warn while any change is unstored or a write runs.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!controller.hasPendingWork()) return;
      void controller.flush();
      event.preventDefault();
    };
    const onHide = () => void controller.flush();
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onHide);
    };
  }, [controller]);

  const slot = openProject ? activeSlot(openProject) : null;
  const current = openProject ? activeSession(openProject) : null;
  const content = current ? currentDocument(current) : null;
  const doc = content?.design ?? null;
  const version = useMemo<DocumentVersion<Doc> | null>(() => (current ? { doc: currentDocument(current).design, revision: current.revision } : null), [current]);
  /** Read-only v1-shaped projection for the frozen `ViewProps.doc` (identity-stable per document). */
  const viewDoc = doc ? legacyProjection(doc) : null;
  const selection = viewDoc ? reconcileSelection(rawSelection, viewDoc) : NO_SELECTION;
  const project = activeProjectOf(session);
  const facade = useMemo(() => projectFacadeProvider(project), [project]);
  const schema = attributes && project && attributes.projectId === project.id ? currentSchema(attributes) : undefined;
  const projectContext = useMemo(() => (doc ? buildProjectViewContext(project, doc, facade, schema) : undefined), [project, doc, facade, schema]);
  const attributesVersion = useMemo(() => (attributes && schema ? { schema, revision: attributes.revision } : undefined), [attributes, schema]);

  /** Shared selection handler: a node/edge selection opens Properties unless deliberately collapsed. */
  const select = useCallback((next: Selection) => {
    setSelection(next);
    if (next.kind !== 'none') setRightPane((pane) => rightPaneOnSelection(pane, true));
  }, []);

  const host = useMemo<WelcomeHost>(
    () => ({
      controller,
      defaultDefinitionId: definitions.defaultId,
      // Read only: attribute schemas saved before local projects existed seed NEW projects once.
      legacyAttributes: legacyBrowserStorage(),
      startingDesign: async (id) => {
        const start = await startProject(PROJECT_GLOBS, { query: id, env: null }, builtInExample());
        if (start.startup.doc) return { ok: true, doc: start.startup.doc, source: start.startup.source };
        return { ok: false, message: `The starting design of “${id ?? 'the default project'}” (${start.startup.source}) could not be loaded.` };
      },
    }),
    [controller, definitions.defaultId],
  );

  /**
   * Run a Welcome / Project Files action; failures are shown and never replace the open project.
   * If the open project has changes that could not be stored, the user decides before they are
   * discarded (the action is repeated with `discard`).
   */
  const runFlow = async (label: string, action: (options: LeaveOptions) => Promise<FlowOutcome>) => {
    setBusy(label);
    try {
      let outcome = await action({});
      if (!outcome.ok && outcome.needsConfirmation) {
        const discard = window.confirm(`${outcome.message}\n\nContinue and lose those changes? (Cancel keeps this project open; Save As New Project keeps them.)`);
        if (!discard) return;
        outcome = await action({ discard: true });
      }
      if (outcome.ok) {
        setFailure(null);
        setWelcomeMode(null);
      } else {
        setFailure({
          source: outcome.source,
          issues: outcome.issues.length ? asGraphIssues(outcome.issues) : [{ path: [], code: 'schema', message: outcome.message } as GraphIssue],
        });
      }
    } finally {
      setBusy(null);
    }
  };

  const openFile = (file: File) =>
    void runFlow('Opening…', async (options) => {
      const text = await file.text();
      return openProjectText(host, text, file.name, options);
    });
  const startExample = () => void runFlow('Opening the example…', (options) => tryExample(host, builtInExample().doc, EXAMPLE_LABEL, options));
  /** Close the project (its changes are written first) and show Welcome's Create form. */
  const backToWelcome = async (definition: string | null = definitions.defaultId) => {
    let closed = await controller.close();
    if (!closed) {
      const reason = controller.getState().save;
      const why = reason.local === 'blocked' ? `\n\n${reason.message}` : '';
      // Never dropped silently: the user decides (Save As New Project keeps them instead).
      if (!window.confirm(`The latest changes of this project could not be saved in this browser.${why}\n\nClose it anyway and lose them?`)) return;
      closed = await controller.close({ discard: true });
    }
    if (closed) setWelcomeMode({ startWith: 'create', definitionId: definition });
  };

  /** Validate and apply one v2 command to the active scenario; one history step, a no-op none. */
  const onDesignCommand = useCallback(
    (command: DesignCommand): CommandOutcome => {
      if (!controller.getState().project) return { ok: false, issues: [noDesign] };
      const outcome = controller.command(command);
      return outcome.ok ? { ok: true } : { ok: false, issues: outcome.issues };
    },
    [controller],
  );

  /** Frozen v1 command handler: translated to the v2 command, so it edits the same stored document. */
  const onCommand = useCallback<GraphCommandHandler>((command) => onDesignCommand(designCommandFromLegacy(command)), [onDesignCommand]);

  /** Pure move/resize preview against the LATEST document (a gizmo re-checks on release). */
  const proposeEdit = useCallback<DesignPort['proposeEdit']>(
    (request) => {
      const open = controller.getState().project;
      if (!open) return { status: 'rejected', issues: [noDesign], collidingRooms: [] };
      return proposeSpatialEdit(currentDocument(activeSession(open)).design, request);
    },
    [controller],
  );

  /** The one live port shared by Graph 2D, Graph 3D, Voxels, Building, Properties and Designer. */
  const port = useMemo<DesignPort | undefined>(
    () => (content ? { doc: content.design, spatial: resolveWithPreferences(content.design, content.facePreferences), onCommand: onDesignCommand, proposeEdit } : undefined),
    [content, onDesignCommand, proposeEdit],
  );

  /** Services for destination panels (Scenarios, Camera, Display): read through `useWorkspaceServices()`. */
  const viewportInfos = useMemo(() => deriveViewports(viewports), [viewports]);
  /** One camera bus per App instance (F-D); 3D viewports register on it under their viewport id. */
  const [cameraBus] = useState(createCameraBus);
  const services = useMemo<WorkspaceServices>(
    () => ({ design: port ?? null, selection, onSelect: select, viewports: viewportInfos, cameraBus }),
    [port, selection, select, viewportInfos, cameraBus],
  );

  /** Apply an already-validated preview as one history step of the active scenario, unless stale or unconfirmed. */
  const onApplyPreview = useCallback(
    (preview: TransformationPreviewV2, ranAt: number, label: string, confirmed: boolean, attributesRevision?: number): ApplyOutcome<Doc> => {
      const open = controller.getState().project;
      const schemaNow = attributesRef.current;
      if (attributesRevision !== undefined && schemaNow && schemaNow.revision !== attributesRevision) {
        return {
          ok: false,
          reason: 'stale',
          message: 'The project attributes have changed since this preview was computed, so it was not applied. Run the algorithm again.',
        };
      }
      const s = open ? activeSession(open) : null;
      const outcome = applyPreviewV2(s && { doc: currentDocument(s).design, revision: s.revision }, preview, ranAt, { confirmRouteDisplacement: confirmed });
      if (outcome.ok) controller.commitDesign(outcome.doc, `Apply “${label}”`);
      return outcome;
    },
    [controller],
  );

  /** Undo or redo one step of the ACTIVE scenario. Selection is reconciled; cameras and layout are untouched. */
  const navigate = useCallback(
    (action: HistoryShortcut) => {
      const moved = action === 'undo' ? controller.undo() : controller.redo();
      const open = controller.getState().project;
      if (!moved || !open) return;
      const nextDoc = legacyProjection(currentDocument(activeSession(open)).design);
      setSelection((sel) => reconcileSelection(sel, nextDoc));
    },
    [controller],
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

  function onToolbarFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (file) openFile(file);
  }

  /** Download the ACTIVE scenario's design as a single design file (schema v2). */
  const exportDesign = () => {
    if (!doc) return;
    try {
      downloadDesign(doc);
    } catch (error) {
      window.alert(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  /** A code project's design as a new scenario of the open project. */
  const openProjectDesign = (designId: string) => {
    const design = project?.designs.find((d) => d.id === designId);
    if (!design) return;
    if (!design.result.ok) {
      setFailure({ source: design.file, issues: design.result.issues });
      return;
    }
    const r = controller.createScenario({ from: 'design', design: design.result.value, name: designId, source: design.file });
    if (!r.ok) window.alert(r.message);
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

  const failureView = failure && <LoadFailure failure={failure} kept={openProject !== null} onDismiss={() => setFailure(null)} />;

  return (
    <ProjectControllerContext.Provider value={controller}>
      <div className="app">
        <header className="toolbar">
          <h1>Spatial Graph Lab</h1>
          {/* Identity only: the open project and its active scenario. Scenarios are switched in the Scenarios section. */}
          {openProject && slot && (
            <div className="project-bar sgl-identity" aria-label="Open project and scenario" aria-busy={session === null ? 'true' : undefined}>
              <button
                type="button"
                className="sgl-identity-project"
                onClick={() => openLeft('project')}
                title={`Project “${openProject.meta.name}”${definitionId ? `, types from ${definitionId}` : ''}: files, information and checks`}
              >
                {openProject.meta.name}
              </button>
              <span className="sgl-identity-sep" aria-hidden="true">
                /
              </span>
              <span className="sgl-identity-design sgl-identity-scenario" title="Active scenario (switch in the Scenarios section)">
                {slot.name}
              </span>
              <SaveStatus controller={controller} compact />
              {status.problems > 0 && (
                <button type="button" className={`sgl-problem-badge ${status.errors > 0 ? 'error' : 'warning'}`} onClick={() => openLeft('project')} title="Show the problems in the Project section">
                  {status.errors > 0 ? '✖' : '⚠'} {status.problems} {status.problems === 1 ? 'problem' : 'problems'}
                </button>
              )}
            </div>
          )}
          <div className="actions">
            {openProject && (
              <div className="history-actions" role="group" aria-label="Scenario edit history">
                <button type="button" disabled={!undoable} title={undoTitle} aria-label={undoTitle} onClick={() => navigate('undo')}>
                  <span aria-hidden="true">↶</span> Undo
                </button>
                <button type="button" disabled={!redoable} title={redoTitle} aria-label={redoTitle} onClick={() => navigate('redo')}>
                  <span aria-hidden="true">↷</span> Redo
                </button>
              </div>
            )}
            {openProject && (
              <label className="file-button" title="Open a project file, or a design JSON file (schema v1 or v2) as a new project">
                Open JSON…
                <input ref={fileInput} type="file" accept=".json,application/json" onChange={onToolbarFile} />
              </label>
            )}
            {openProject && (
              <button type="button" disabled={!doc} onClick={exportDesign} title="Download the active scenario’s design as schema-v2 JSON (Project → Export Project saves every scenario)">
                Export JSON
              </button>
            )}
          </div>
        </header>

        <main>
          {cstate.notice && (
            <section className="issues sgl-notice" role="status">
              <p>{cstate.notice}</p>
              <button type="button" onClick={() => controller.dismissNotice()}>
                Dismiss
              </button>
            </section>
          )}
          {welcome ? (
            <Welcome
              key={welcomeMode ? `${welcomeMode.startWith}:${welcomeMode.definitionId ?? ''}` : 'start'}
              definitions={definitions.ids.map((id) => ({ id, label: id }))}
              defaultDefinitionId={welcomeMode?.definitionId ?? definitions.defaultId}
              startWith={welcomeMode?.startWith ?? 'choices'}
              recent={recent}
              busy={busy}
              error={failureView}
              onCreate={(name, id) => void runFlow('Creating the project…', (options) => createProject(host, name, id, options))}
              onOpenFile={openFile}
              onTryExample={startExample}
              onRestore={(id) =>
                void runFlow('Opening…', async (options) => {
                  const r = await controller.restore(id, options);
                  if (r.ok) return { ok: true, projectId: id };
                  return { ok: false, source: 'the stored project', message: r.message, issues: [], ...(r.status === 'needs-confirmation' && { needsConfirmation: true as const }) };
                })
              }
              onDiscardUnreadable={(id) => void controller.discardUnreadable(id).then(async () => setRecent(recentStateOf(await controller.listRecent())))}
            />
          ) : (
            <>
              {failureView}
              <WorkspaceServicesContext.Provider value={services}>
                {/* Saved cameras and Display (workstream E): in-memory per App until I1 binds them to the active scenario of the project file. */}
                <SavedCamerasProvider scenarioId={UNBOUND_SCENARIO_ID}>
                <DisplayProvider scenarioId={UNBOUND_SCENARIO_ID}>
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
                    empty={<p className="meta">No design is open.</p>}
                    sections={{
                      project: (
                        <>
                          <section className="sgl-section sgl-project-files-section">
                            <h4>Project Files</h4>
                            {/* Keyed by project: no draft name or Save As form carries over to another project. */}
                            <ProjectNameField key={`name:${projectId ?? '-'}`} controller={controller} />
                            <ProjectFiles key={`files:${projectId ?? '-'}`} controller={controller} onNew={() => void backToWelcome()} onOpenFile={openFile} />
                            <SaveStatus controller={controller} />
                          </section>
                          <ProjectPanel
                            session={session}
                            docLoaded={doc !== null}
                            source={current?.source ?? null}
                            designName={doc?.metadata.name ?? null}
                            // EXPORT state only ("not exported" ≠ "unsaved"); local saving is shown by SaveStatus.
                            modified={openProject !== null && !isExported(openProject)}
                            conformance={conformance}
                            attributeProblems={attributeProblems}
                            onSwitchProject={(id) => void backToWelcome(id)}
                            onOpenDesign={openProjectDesign}
                            onSelect={select}
                            onLoadExample={startExample}
                            onOpenFile={() => fileInput.current?.click()}
                            onExport={exportDesign}
                          />
                        </>
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
                </DisplayProvider>
                </SavedCamerasProvider>
              </WorkspaceServicesContext.Provider>
            </>
          )}
        </main>
      </div>
    </ProjectControllerContext.Provider>
  );
}
