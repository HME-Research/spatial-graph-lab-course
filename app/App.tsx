import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AboutButton } from './ui/about';
import { GuideButton } from './ui/guide';
import exampleDesign from './document/examples/house.json';
import { type DesignDocumentV2, formatIssuePath, type GraphIssue, nodeLabel, readDesign } from '@app/document';
import {
  designAssetIds,
  discoverToolkits,
  listToolkitExamples,
  loadToolkitAssets,
  projectOnlyToolkit,
  TOOLKIT_GLOBS,
  selectToolkit,
  withProjectFunctions,
  isProjectFunction,
  type AttributeCollection,
  type ExtensionDiagnostic,
  type StoredUpload,
  type TransformationPreviewV2,
} from '@app/extensions';
import { createIndexedDbProjectStore, facadeAssetsOf, type ProjectIssue } from '@app/project';
import { proposeSpatialEdit, resolveWithPreferences, type DesignCommand, type DesignPort, type ScenarioCommand } from '@app/spatial';
import type { CommandOutcome } from '@app/views/contracts';
import { conciseIssues, presentAnalysis, type AnalysisPresentation } from '@app/views/presentation';
import { buildProjectViewContext, projectFacadeProvider } from '@app/views/project';
import { NO_SELECTION, reconcileSelection, selectEdge, type Selection } from '@core/viewer/selection';
import { createCameraBus } from '@core/viewer/three/camera';
import { AttributesPanel } from './attributes/AttributesPanel';
import { DesignerPanel, FacadeLibrarySection, type DesignerFacades } from './designer';
import { SaveStatus } from './scenarios/SaveStatus';
import { AnalysePanel, type ShownAnalysis } from './analysis/AnalysePanel';
import { sanitizeShownAnalyses } from './analysis/analyseModel';
import { TransformPanel } from './session/TransformPanel';
import { applyPreviewV2, isStale, type ApplyOutcome } from './session/algorithmSession';
import { currentDocument, type DocumentVersion } from './session/documentSession';
import { canRedo, canUndo, createHistory, redoLabel, undoLabel } from './session/history';
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
import { activeToolkitOf, readToolkitRequest, startToolkit, type ToolkitSession } from './session/toolkitSession';
import { activeSession, activeSlot } from './session/projectStore';
import { createProjectController, showsWelcome, type LeaveOptions } from './session/projectStoreController';
import { createProjectCameraStore, createProjectDisplayStore } from './session/projectViewSettings';
import { ProjectControllerContext, useProjectControllerState } from './session/projectStoreContext';
import { historyButtonTitle, historyShortcut, isApplePlatform, type HistoryShortcut } from './session/shortcuts';
import './session/session.css';
import { ProjectFiles } from './welcome/ProjectFiles';
import { EmptyShell, Welcome } from './welcome/Welcome';
import { FunctionsDialog } from './attributes/FunctionsDialog';
import { ManageFunctionsContext } from './attributes/navigation';
import { SIDEBAR_LABELS, SIDEBAR_SECTIONS } from '@app/ui/labels';
import { createProject, openProjectText, openToolkitExample, tryExample, type FlowOutcome, type WelcomeHost } from './welcome/welcomeFlow';
import { DEFAULT_PROJECT_NAME, exampleOptions, recentStateOf, toolkitLabel, type ExampleChoice, type RecentState } from './welcome/welcomeModel';
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
import { SavedCamerasProvider } from '@app/camera/savedCameras';
import { DisplayProvider } from '@app/display/DisplayProvider';
import { sanitizeEnabledMetrics } from '@app/metrics';
import { EnabledMetricsContext } from '@app/views/three/enabledMetrics';
import { EMPTY_FACADE_LIBRARY, facadeLibraryOf, FacadeLibraryContext } from '@app/views/three/facadeLibrary';
import { RoomHighlightContext, SetRoomHighlightContext, type RoomHighlight } from '@app/views/roomHighlight';
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
 * toolkit (`toolkits/<id>`) named by the local project's `toolkit` supplies types and
 * algorithms; without one the project's own registry is used (`projectOnlyToolkit`).
 */

const EXAMPLE_LABEL = 'app/document/examples/house.json';

type Doc = DesignDocumentV2;

interface LoadFailureState {
  readonly source: string;
  readonly issues: readonly GraphIssue[];
}

const noDesign: GraphIssue = { path: [], code: 'not-found', message: 'no design is loaded' };

/** The built-in graph-only example (no toolkit): used when no project design is available. */
function builtInExample(): { readonly doc: Doc; readonly source: string } {
  const result = readDesign(exampleDesign);
  if (!result.ok) throw new Error(`the built-in example is invalid: ${result.issues.map((i) => i.message).join('; ')}`);
  return { doc: result.value.doc, source: EXAMPLE_LABEL };
}

const APPLE = typeof navigator !== 'undefined' && isApplePlatform(navigator.platform);

/**
 * An empty key-value store: `loadAttributeSession` then yields the toolkit files' schema.
 * Local projects carry their attribute record in their own project file instead.
 */
const NO_STORAGE: KeyValueStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };

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
      <h2>{kept ? feedback.headline : `${feedback.headline} No project is open.`}</h2>
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

/** Toolkits available for new projects, and the default one (`?toolkit=` / VITE_SGL_TOOLKIT / none). */
function toolkitChoices() {
  const ids = discoverToolkits(TOOLKIT_GLOBS).toolkits.map((p) => p.id);
  const env = import.meta.env['VITE_SGL_TOOLKIT'] as string | undefined;
  const selected = selectToolkit(ids, readToolkitRequest(typeof window === 'undefined' ? '' : window.location.search, env));
  return { ids, defaultId: selected.diagnostic ? (ids[0] ?? null) : selected.id };
}

export function App() {
  /** The local project controller: one per App instance, IndexedDB-backed. */
  const [controller] = useState(() => createProjectController({ store: createIndexedDbProjectStore() }));
  const cstate = useProjectControllerState(controller);
  /** Saved cameras and Display (workstream E) bound to the open project's scenarios and settings (I1). */
  const [cameraStore] = useState(() => createProjectCameraStore(controller));
  const [displayStore] = useState(() => createProjectDisplayStore(controller));
  const openProject = cstate.project;
  const [failure, setFailure] = useState<LoadFailureState | null>(null);
  const [recent, setRecent] = useState<RecentState>({ status: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);
  const [toolkits] = useState(toolkitChoices);
  const toolkitOptions = useMemo(() => toolkits.ids.map((id) => ({ id, label: toolkitLabel(id) })), [toolkits]);
  /** Activation of the open project's toolkit; null while activating or without project. */
  const [session, setSession] = useState<ToolkitSession | null>(null);
  const [rawSelection, setSelection] = useState<Selection>(NO_SELECTION);
  /** The Analyse result shown in the panel and on the model (never part of the document). */
  const [shownAnalysis, setShownAnalysis] = useState<ShownAnalysis | null>(null);
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
  /** The Functions pop-up (add or remove node types) is open. */
  const [functionsOpen, setFunctionsOpen] = useState(false);
  /** Rooms lit up by a Designer card's highlight button (view-only, never saved). */
  const [roomHighlight, setRoomHighlight] = useState<RoomHighlight | null>(null);

  const toolkitId = openProject?.meta.toolkit?.id ?? null;
  const projectId = openProject?.meta.projectId ?? null;
  const scenarioId = openProject?.activeScenarioId ?? null;
  // Another project or scenario: its rooms are different, so no highlight carries over.
  useEffect(() => setRoomHighlight(null), [projectId, scenarioId]);
  /** The project's calculated values (`settings.calculatedFields`), validated at runtime; absent = defaults. */
  const storedCalculatedFields = openProject?.meta.settings.calculatedFields;
  const calculatedFields = useMemo(() => sanitizeEnabledMetrics(storedCalculatedFields).enabled, [storedCalculatedFields]);
  /** The built-ins listed in Analyse (`settings.analyses`, P4), validated at runtime; absent = defaults. */
  const storedAnalyses = openProject?.meta.settings.analyses;
  const shownBuiltIns = useMemo(() => sanitizeShownAnalyses(storedAnalyses), [storedAnalyses]);
  /** The student's uploaded analyses (`settings.uploadedAnalyses`, P4 item I): source text, compiled by the Analyse panel. */
  const uploadedAnalyses = openProject?.meta.settings.uploadedAnalyses;
  /** The project's imported façades (`assets`): drawn by the Building, managed in the Designer. */
  const storedAssets = openProject?.meta.assets;
  const facadeLibrary = useMemo(() => (storedAssets ? facadeLibraryOf(facadeAssetsOf(storedAssets)) : EMPTY_FACADE_LIBRARY), [storedAssets]);
  const designerFacades = useMemo<DesignerFacades>(
    () => ({
      assets: facadeLibrary.assets,
      add: (asset) => controller.addFacadeAsset(asset),
      remove: (assetId, options) => controller.removeFacadeAsset(assetId, options),
      uses: (assetId) => controller.facadeUses(assetId),
      rename: (assetId, name) => controller.renameFacadeAsset(assetId, name),
      setMaterials: (assetId, materials, role) => controller.setFacadeAssetMaterials(assetId, materials, role),
    }),
    [facadeLibrary, controller],
  );

  /**
   * A user change of the schema: carried in the LOCAL project file (autosaved with the project),
   * so each local project keeps its own fields, also when several use the same toolkit.
   */
  const setAttributes = useCallback(
    (next: AttributeSession | null, persist = true) => {
      attributesRef.current = next;
      setAttributesRaw(next);
      if (next && persist) {
        setAttributeSaveError(null);
        const open = controller.getState().project;
        // The record's owner scope: the toolkit id, or the project's own id without a toolkit.
        if (open && (open.meta.toolkit?.id ?? open.meta.projectId) === next.projectId) {
          controller.setAttributeRecord(differsFromFiles(next) ? (JSON.parse(exportAttributeFile(next)) as unknown) : null);
        }
      }
    },
    [controller],
  );

  // Activate the open project's toolkit (types, algorithms) whenever the project changes.
  useEffect(() => {
    if (projectId === null) {
      setSession(null);
      setAttributes(null, false);
      return;
    }
    let cancelled = false;
    setSession(null);
    void startToolkit(TOOLKIT_GLOBS, { query: toolkitId, env: null }, builtInExample()).then((start) => {
      if (cancelled) return;
      setSession(start.session);
      // Without a toolkit the project's own registry: its functions and attributes work the same way.
      const active = activeToolkitOf(start.session) ?? (start.session.activation.status === 'none' ? projectOnlyToolkit(projectId) : null);
      setAttributeSaveError(null);
      if (!active) {
        setAttributes(null, false);
        return;
      }
      // The schema in use is the LOCAL project's own record, else the toolkit's files. The
      // browser copy (keyed by toolkit, shared by every local project using it) is not read.
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
        setAttributeSaveError(`the project’s attribute fields could not be read, so the toolkit files’ fields are shown: ${imported.issues.map((i) => i.message).join('; ')}`);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, toolkitId, controller, setAttributes]);

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
  const selection = doc ? reconcileSelection(rawSelection, doc) : NO_SELECTION;
  /** Project functions (`settings.functions`) and removed toolkit functions merged into the toolkit's types. */
  const projectFunctions = openProject?.meta.settings.functions;
  const hiddenFunctions = openProject?.meta.settings.hiddenFunctions;
  const activeToolkit = useMemo(
    () => activeToolkitOf(session) ?? (session?.activation.status === 'none' && projectId !== null ? projectOnlyToolkit(projectId) : null),
    [session, projectId],
  );
  const project = useMemo(() => (activeToolkit ? withProjectFunctions(activeToolkit, projectFunctions, hiddenFunctions ?? []) : null), [activeToolkit, projectFunctions, hiddenFunctions]);
  /** Every scenario's current design (attribute values are checked and counted across all of them). */
  const scenarioDesigns = useMemo(
    () => (openProject ? openProject.scenarios.map((s) => ({ id: s.id, name: s.name, doc: currentDocument(s.session).design })) : []),
    [openProject],
  );
  const usedTypeIds = useMemo(() => scenarioDesigns.flatMap((s) => s.doc.nodes.map((n) => n.function)), [scenarioDesigns]);
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
      defaultToolkitId: toolkits.defaultId,
      startingDesign: async (id) => {
        // No toolkit: the built-in example's settings (never the default toolkit's, which activation would pick).
        if (id === null) return { ok: true, ...builtInExample() };
        const start = await startToolkit(TOOLKIT_GLOBS, { query: id, env: null }, builtInExample());
        // Only the design's Building settings are used (Create starts with an empty graph); the
        // toolkit's custom attributes are added to the new project (owner decision 2026-11-19).
        const baseline = activeToolkitOf(start.session)?.attributeBaseline;
        if (start.startup.doc) {
          return { ok: true, doc: start.startup.doc, source: start.startup.source, ...(baseline && { attributeSignature: baseline.signature, attributeSchema: baseline.schema }) };
        }
        return { ok: false, message: `The starting design of ${id === null ? 'the built-in example' : `toolkit “${toolkitLabel(id)}”`} (${start.startup.source}) could not be loaded.` };
      },
      // Open example… (owner decision 2026-11-20): one design of one toolkit, validated by
      // activation, with the toolkit's custom attributes and the façade assets the design uses.
      exampleDesign: async (toolkitId, designId) => {
        const start = await startToolkit(TOOLKIT_GLOBS, { query: toolkitId, env: null }, builtInExample());
        const active = activeToolkitOf(start.session);
        if (!active) return { ok: false, source: toolkitLabel(toolkitId), message: `toolkit “${toolkitLabel(toolkitId)}” could not be activated.` };
        const design = active.designs.find((d) => d.id === designId);
        if (!design) return { ok: false, source: designId, message: `toolkit “${active.definition.name}” has no design “${designId}”.` };
        if (!design.result.ok) {
          const issues = design.result.issues.map((i) => ({ path: ['design', ...i.path], code: 'invalid-design' as const, message: i.message }));
          return { ok: false, source: design.file, message: `${design.file} is not a valid design.`, issues };
        }
        const files = discoverToolkits(TOOLKIT_GLOBS).toolkits.find((t) => t.id === toolkitId)?.assets ?? [];
        // The toolkit's façade files go through the normal (lazily loaded) 3DM import, only when the design uses one.
        const assets = await loadToolkitAssets(toolkitId, files, designAssetIds(design.result.value), {
          fetchBytes: async (url) => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`the server answered ${response.status}`);
            return new Uint8Array(await response.arrayBuffer());
          },
          importFile: async (bytes, fileName) => (await import('@app/assets/rhino/browser')).importFacadeFile(bytes, fileName, { outward: '-y' }),
        });
        if (!assets.ok) return { ok: false, source: design.file, message: assets.message };
        const baseline = active.attributeBaseline;
        return { ok: true, doc: design.result.value, source: design.file, attributeSignature: baseline.signature, attributeSchema: baseline.schema, assets: assets.assets };
      },
    }),
    [controller, toolkits.defaultId],
  );

  /** Open example…: the built-in example and every toolkit design (listed when the dialog opens). */
  const loadExamples = useCallback(async () => exampleOptions(builtInExample().doc.metadata, await listToolkitExamples(TOOLKIT_GLOBS)), []);

  /**
   * Run a Welcome / Project Files action; failures are shown and never replace the open project.
   * If the open project has changes that could not be stored, the user decides before they are
   * discarded (the action is repeated with `discard`).
   */
  const runFlow = async (label: string, action: (options: LeaveOptions) => Promise<FlowOutcome>) => {
    // Only the last session is kept without asking: a project that was not saved locally is
    // replaced by the next one. Ask first when it has changes.
    const shown = controller.getState();
    if (shown.project && shown.kept !== true && shown.project.changes > 0) {
      const keep = !window.confirm(
        `“${shown.project.meta.name}” is not saved in this browser. Opening another project replaces it.

Continue? (Cancel keeps it open: use Project → Save locally, or Export project.)`,
      );
      if (keep) return;
    }
    setBusy(label);
    try {
      let outcome = await action({});
      if (!outcome.ok && outcome.needsConfirmation) {
        const discard = window.confirm(`${outcome.message}\n\nContinue and lose those changes? (Cancel keeps this project open; Save as new project keeps them.)`);
        if (!discard) return;
        outcome = await action({ discard: true });
      }
      if (outcome.ok) {
        setFailure(null);
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
  /** Open example… (owner 2026-11-20): always a NEW project; the built-in one takes Try example's path. */
  const openExample = (choice: ExampleChoice) =>
    choice.kind === 'built-in'
      ? startExample()
      : void runFlow('Opening the example…', (options) => openToolkitExample(host, choice.toolkitId, choice.designId, options));
  /**
   * Create project (Welcome) and New project (Project panel): a clean project straight away, named
   * "Untitled project" (rename it in Project) with the chosen toolkit; no name form in between
   * (owner 2026-11-17). Welcome shows a Toolkit choice beside Create project; the Project panel asks
   * with the same choice in a small dialog whenever there is a toolkit, "No toolkit" preselected
   * like Welcome (owner 2026-11-19). Leaving an open project with unsaved
   * changes is asked in `runFlow`.
   */
  const startNewProject = (toolkitId: string | null) =>
    void runFlow('Creating the project…', (options) => createProject(host, DEFAULT_PROJECT_NAME, toolkitId, options));

  /**
   * Validate and apply one command to the active scenario; one history step, a no-op none. Design
   * commands and (wave 2, D) scenario commands such as `add-edge-at-face` take the same path.
   */
  const onScenarioCommand = useCallback(
    (command: ScenarioCommand): CommandOutcome => {
      if (!controller.getState().project) return { ok: false, issues: [noDesign] };
      const outcome = controller.command(command);
      return outcome.ok ? { ok: true } : { ok: false, issues: outcome.issues };
    },
    [controller],
  );
  const onDesignCommand = useCallback((command: DesignCommand): CommandOutcome => onScenarioCommand(command), [onScenarioCommand]);

  /** Frozen v1 command handler: translated to the v2 command, so it edits the same stored document. */

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
    () =>
      content
        ? { doc: content.design, spatial: resolveWithPreferences(content.design, content.facePreferences), onCommand: onDesignCommand, onScenarioCommand, proposeEdit }
        : undefined,
    [content, onDesignCommand, onScenarioCommand, proposeEdit],
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
      const nextDoc = currentDocument(activeSession(open)).design;
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

  /** Analysis overlay: rebuilt on every document change so a stale result is visibly marked. */
  const analysis = useMemo<AnalysisPresentation | null>(() => {
    if (!shownAnalysis || !doc || !version) return null;
    const { answer } = shownAnalysis;
    return presentAnalysis({
      title: shownAnalysis.title,
      ...(answer.nodeValues !== undefined && { nodeValues: answer.nodeValues }),
      highlightNodes: answer.highlightNodes,
      highlightEdges: answer.highlightEdges,
      ranOnNodeIds: shownAnalysis.doc.nodes.map((n) => n.id),
      currentNodeIds: doc.nodes.map((n) => n.id),
      stale: isStale(shownAnalysis, version, attributes?.revision),
      labelOf: new Map(doc.nodes.map((n) => [n.id, nodeLabel(n)] as const)),
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
      ? [{ id: 'attribute-save', code: 'attribute-schema-storage', severity: 'error', subject: { kind: 'toolkit', id: project?.id ?? '' }, message: `project attributes were not saved: ${attributeSaveError}` } as const]
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
          <div className="toolbar-title">
            <h1>Spatial Graph Lab</h1>
            <AboutButton />
          </div>
          {/* Identity only: the open project and its active scenario. Scenarios are switched in the Scenarios section. */}
          {openProject && slot && (
            <div className="project-bar sgl-identity" aria-label="Open project and scenario" aria-busy={session === null ? 'true' : undefined}>
              <button
                type="button"
                className="sgl-identity-project"
                onClick={() => openLeft('project')}
                title={`Project “${openProject.meta.name}”: information, files and checks`}
              >
                {openProject.meta.name}
              </button>
              {/* The toolkit the project was created with (fixed per project; see docs/DECISIONS.md). */}
              <span
                className={`sgl-identity-toolkit${toolkitId !== null && session !== null && activeToolkit === null ? ' failed' : ''}`}
                title={
                  toolkitId === null
                    ? 'This project uses no toolkit (built-in types only)'
                    : `Toolkit: toolkits/${toolkitId}${session !== null && activeToolkit === null ? ' (could not be loaded; see Project → Advanced)' : ''}`
                }
              >
                {toolkitId === null ? 'No toolkit' : activeToolkit?.id === toolkitId ? activeToolkit.definition.name : toolkitLabel(toolkitId)}
              </span>
              <span className="sgl-identity-sep" aria-hidden="true">
                /
              </span>
              <span className="sgl-identity-design sgl-identity-scenario" title="Active scenario (switch scenarios in the Scenarios tab)">
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
            <GuideButton />
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
            <>
            {/* Welcome is a modal overlay on a neutral, inert shell: nothing is created or saved to draw it. */}
            <EmptyShell labels={SIDEBAR_SECTIONS.map((s) => SIDEBAR_LABELS[s])} />
            <Welcome
              recent={recent}
              busy={busy}
              error={failureView}
              toolkits={toolkitOptions}
              defaultToolkitId={toolkits.defaultId}
              onCreate={startNewProject}
              onOpenFile={openFile}
              onTryExample={startExample}
              loadExamples={loadExamples}
              onOpenExample={openExample}
              onRestore={(id) =>
                void runFlow('Opening…', async (options) => {
                  const r = await controller.restore(id, options);
                  if (r.ok) return { ok: true, projectId: id };
                  return { ok: false, source: 'the stored project', message: r.message, issues: [], ...(r.status === 'needs-confirmation' && { needsConfirmation: true as const }) };
                })
              }
              onDiscardUnreadable={(id) => void controller.discardUnreadable(id).then(async () => setRecent(recentStateOf(await controller.listRecent())))}
            />
            </>
          ) : (
            <>
              {failureView}
              <WorkspaceServicesContext.Provider value={services}>
                {/* Saved cameras and Display of the ACTIVE scenario, persisted in the project file (autosaved, not undoable). */}
                <SavedCamerasProvider scenarioId={scenarioId ?? ''} store={cameraStore}>
                <DisplayProvider scenarioId={scenarioId ?? ''} store={displayStore}>
                <EnabledMetricsContext.Provider value={calculatedFields}>
                <FacadeLibraryContext.Provider value={facadeLibrary}>
                <RoomHighlightContext.Provider value={roomHighlight}>
                <SetRoomHighlightContext.Provider value={setRoomHighlight}>
                <OpenAttributesContext.Provider value={project ? openAttributes : null}>
                <ManageFunctionsContext.Provider value={project ? () => setFunctionsOpen(true) : null}>
                  <Workspace
                    view={
                      doc && port
                        ? { design: port, selection, onSelect: select, ...(projectContext && { project: projectContext }) }
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
                    empty={<p className="meta">No scenario is open.</p>}
                    sections={{
                      project: (
                          <ProjectPanel
                            // Keyed by project: no draft name or Save As dialog carries over to another project.
                            overview={<ProjectFiles key={`files:${projectId ?? '-'}`} controller={controller} toolkits={toolkitOptions} defaultToolkitId={toolkits.defaultId} onNew={startNewProject} onOpenFile={openFile} loadExamples={loadExamples} onOpenExample={openExample} busy={busy} />}
                            session={session}
                            docLoaded={doc !== null}
                            source={current?.source ?? null}
                            conformance={conformance}
                            attributeProblems={attributeProblems}
                            onSelect={select}
                            {...(openProject && { library: <FacadeLibrarySection facades={designerFacades} /> })}
                          />
                      ),
                      attributes: (
                        <AttributesPanel
                          session={attributes}
                          project={project}
                          doc={doc}
                          source={current?.source ?? null}
                          scenarios={scenarioDesigns}
                          onManageFunctions={() => setFunctionsOpen(true)}
                          onChange={(next) => setAttributes(next)}
                          saveError={attributeSaveError}
                          collection={attributeCollection}
                          onCollection={setAttributeCollection}
                          calculatedFields={calculatedFields}
                          onCalculatedFields={(ids) => controller.setCalculatedFields(ids)}
                        />
                      ),
                      designer: port ? (
                        <DesignerPanel
                          design={port}
                          {...(projectContext && { project: projectContext })}
                          selection={selection}
                          facades={designerFacades}
                          onShowRelationship={(edgeId) => {
                            setSelection(selectEdge(edgeId));
                            setRightCollapsedByUser(false);
                          }}
                        />
                      ) : (
                        <p className="meta">Open a project to change its appearance.</p>
                      ),
                      analyse: (
                        <AnalysePanel
                          key={`${project?.id ?? '-'}:${generation}`}
                          project={project}
                          version={version}
                          selection={selection}
                          shown={shownAnalysis}
                          onShow={setShownAnalysis}
                          shownBuiltIns={shownBuiltIns}
                          {...(openProject && { onShownBuiltIns: (ids: readonly string[]) => controller.setShownAnalyses(ids) })}
                          {...(uploadedAnalyses && { uploads: uploadedAnalyses })}
                          {...(openProject && { onUploads: (list: readonly StoredUpload[]) => controller.setUploadedAnalyses(list) })}
                          {...(attributesVersion && { attributes: attributesVersion })}
                          {...(port && { resolution: port })}
                        />
                      ),
                      transform: (
                        <TransformPanel
                          key={`${project?.id ?? '-'}:${generation}`}
                          project={project}
                          version={version}
                          onApply={onApplyPreview}
                          onSelect={select}
                          {...(attributesVersion && { attributes: attributesVersion })}
                          {...(port && { resolution: port })}
                        />
                      ),
                      // Panel slots (Gate F): workstreams own the component bodies, the registry owns the map.
                      scenarios: <DESTINATION_PANELS.scenarios />,
                      camera: <DESTINATION_PANELS.camera />,
                      display: <DESTINATION_PANELS.display />,
                    }}
                  />
                </ManageFunctionsContext.Provider>
                </OpenAttributesContext.Provider>
                </SetRoomHighlightContext.Provider>
                </RoomHighlightContext.Provider>
                </FacadeLibraryContext.Provider>
                </EnabledMetricsContext.Provider>
                </DisplayProvider>
                </SavedCamerasProvider>
              </WorkspaceServicesContext.Provider>
              {functionsOpen && openProject && (
                <FunctionsDialog
                  toolkitTypes={(activeToolkit?.functions ?? []).filter((t) => t.status.ok && !isProjectFunction(t)).map((t) => ({ id: t.id, label: t.definition.label }))}
                  projectFunctions={projectFunctions ?? []}
                  hidden={hiddenFunctions ?? []}
                  usedTypeIds={usedTypeIds}
                  onChange={(functions, hidden) => controller.setFunctions(functions, hidden)}
                  onClose={() => setFunctionsOpen(false)}
                />
              )}
            </>
          )}
        </main>
      </div>
    </ProjectControllerContext.Provider>
  );
}
