import { createElement, Suspense, useContext, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { AnalysisOverlayContext } from '@app/views/analysisOverlay';
import type { ViewMode, ViewProps } from '@app/views/contracts';
import { createPanelMemory, PanelMemoryContext, type PanelMemory } from '@app/views/panelMemory';
import type { AnalysisPresentation } from '@app/views/presentation';
import { AnalysisLegend } from '@app/views/presentation/LegendViews';
import { VIEW_COMPONENTS } from '@app/views/registry';
import { EditPanelOwnerContext, PanelIndexContext } from '@app/views/three/editing/editPanelOwner';
import { DataCellEditorContext } from '@app/views/data/cellEditing';
import { ViewportCameraContext, type ViewportCamera } from '@app/views/viewportCamera';
import { ViewportDisplay } from '@app/display/DisplayProvider';
import { ChevronIcon, PROPERTIES_DESCRIPTION, PROPERTIES_LABEL, PropertiesIcon, SidebarNav, VIEW_CAPTIONS, ViewModeSelect, type SidebarSection } from '@app/ui';
import { DESTINATIONS } from '@app/workspace/destinations';
import {
  browserPaneStorage,
  clampLeftWidth,
  clampRightWidth,
  keyboardResize,
  keyboardRightResize,
  LEFT_WIDTH_MAX,
  LEFT_WIDTH_MIN,
  readRightWidth,
  RIGHT_WIDTH_MAX,
  RIGHT_WIDTH_MIN,
  writeRightWidth,
} from '@app/workspace/panes';
import { keyboardSplit, readViewportSplit, splitFromPointer, splitStyle, writeViewportSplit, type ViewportSplit } from '@app/workspace/viewportSplit';
import { WorkspaceServicesContext } from '@app/workspace/services';
import {
  canMaximise,
  deriveViewports,
  editPanelOwner,
  isMounted,
  setViewportLayout,
  setViewportMode,
  toggleMaximise,
  VIEWPORT_IDS,
  VIEWPORT_INDICES,
  VIEWPORT_LAYOUTS,
  type ViewportIndex,
  type ViewportLayout,
  type ViewportState,
} from '@app/workspace/viewports';
import { PropertiesPanel } from './inspector/Inspector';
import { TableCellEditor } from './inspector/TableCellEditor';

/** Kept for existing importers; the value lives in `app/workspace/panes.ts`. */
export { LEFT_AUTO_COLLAPSE_BELOW } from '@app/workspace/panes';

export interface WorkspaceProps {
  /** The open design's view props; null when no design is open (the rails stay usable). */
  readonly view: ViewProps | null;
  /** Content of the seven left destinations. */
  readonly sections: Readonly<Record<SidebarSection, ReactNode>>;
  readonly leftTab: SidebarSection;
  readonly onLeftTab: (tab: SidebarSection) => void;
  readonly leftCollapsed: boolean;
  readonly onLeftCollapsed: (collapsed: boolean) => void;
  /** Width of the open left pane in CSS px (rail + content), already clamped. */
  readonly leftWidth: number;
  /** Resize of the left pane; `done` = the gesture ended (pointer released or a key step), so it may be remembered. */
  readonly onLeftWidth: (width: number, done: boolean) => void;
  readonly rightCollapsed: boolean;
  readonly onRightCollapsed: (collapsed: boolean) => void;
  /** Viewport layout, modes and maximise (owned by the shell so WorkspaceServices can describe it). */
  readonly viewports: ViewportState;
  readonly onViewports: (update: (prev: ViewportState) => ViewportState) => void;
  /** Analysis values shown on the model (Stage 07 overlay), or null. Never part of the document. */
  readonly analysis?: AnalysisPresentation | null;
  readonly onClearAnalysis?: () => void;
  /** Shown in the centre when no design is open. */
  readonly empty?: ReactNode;
}

/**
 * Application workspace (Gate F shell):
 * - LEFT: a persistent vertical rail with seven destinations (`app/workspace/destinations.ts`)
 *   whose content opens beside the rail; the pane is resizable (separator handle, arrow keys) and
 *   collapses to the rail with a chevron centred on its edge;
 * - CENTRE: 1, 2 or 4 coordinated viewports (`app/workspace/viewports.ts`) with per-viewport
 *   camera memory and Maximise/Restore; a maximise hides the others without unmounting them;
 * - RIGHT: Properties of the selection only, collapsible to its own rail.
 *
 * Every section stays mounted while hidden (drafts, results and diagnostics survive switching
 * and collapsing). Viewports outside the layout are unmounted; viewport 1 is never remounted by a
 * layout change. Rail, collapse, width and viewport state are owned by the shell (App).
 */
export function Workspace({
  view,
  sections,
  leftTab,
  onLeftTab,
  leftCollapsed,
  onLeftCollapsed,
  leftWidth,
  onLeftWidth,
  rightCollapsed,
  onRightCollapsed,
  viewports,
  onViewports,
  analysis = null,
  onClearAnalysis,
  empty,
}: WorkspaceProps) {
  const [memories] = useState<readonly PanelMemory[]>(() => VIEWPORT_INDICES.map(() => createPanelMemory()));
  /** The viewport last interacted with; decides which of several editing views shows the room editor. */
  const [lastPanel, setLastPanel] = useState<ViewportIndex>(1);

  /** The App's camera bus (WorkspaceServices); each viewport's 3D canvas registers under its viewport id. */
  const cameraBus = useContext(WorkspaceServicesContext)?.cameraBus ?? null;
  const viewportCameras = useMemo<readonly (ViewportCamera | null)[]>(
    () => VIEWPORT_INDICES.map((index) => (cameraBus ? { viewportId: VIEWPORT_IDS[index], cameraBus } : null)),
    [cameraBus],
  );

  const infos = deriveViewports(viewports);
  const editOwner = editPanelOwner(infos, lastPanel);
  const mounted = VIEWPORT_INDICES.filter((index) => isMounted(viewports, index));
  /** The layout selector sits in the first VISIBLE viewport, so it stays reachable while another one is maximised. */
  const layoutHost = mounted.find((index) => infos[index]?.visible) ?? 0;

  const content = (id: SidebarSection): ReactNode =>
    // A result with node values (e.g. Connected parts) also gets its colour legend in Analyse.
    id === 'analyse' ? (
      <>
        {analysis?.hasValues && <AnalysisLegend presentation={analysis} {...(onClearAnalysis && { onClear: onClearAnalysis })} />}
        {sections.analyse}
      </>
    ) : (
      sections[id]
    );

  const className = ['workspace', leftCollapsed ? 'left-collapsed' : 'left-open', rightCollapsed ? 'right-collapsed' : 'right-open'].join(' ');
  const panelsClass = ['panels', `layout-${viewports.layout}`, viewports.maximised !== null ? 'maximised' : ''].filter(Boolean).join(' ');
  // Movable divisions between the viewports (owner 2026-11-20), remembered in the browser.
  const [split, setSplit] = useState<ViewportSplit>(() => readViewportSplit(browserPaneStorage()));
  const changeSplit = (next: ViewportSplit, done: boolean) => {
    setSplit(next);
    if (done) writeViewportSplit(browserPaneStorage(), next);
  };
  const showDividers = viewports.layout !== 1 && viewports.maximised === null;
  // The Properties pane is resizable too (owner 2026-11-20); null = the stylesheet's default width.
  const [rightWidth, setRightWidth] = useState<number | null>(() => readRightWidth(browserPaneStorage()));
  const changeRightWidth = (width: number, done: boolean) => {
    setRightWidth(width);
    if (done) writeRightWidth(browserPaneStorage(), width);
  };
  const workspaceStyle = { '--left-width': `${leftWidth}px`, ...(rightWidth !== null && { '--right-width': `${rightWidth}px` }) } as CSSProperties;

  return (
    <AnalysisOverlayContext.Provider value={analysis}>
      <section className={className} aria-label="Workspace" style={workspaceStyle}>
        <div className="left-pane">
          <SidebarNav
            side="left"
            label="project tools"
            active={leftTab}
            onActive={(id) => onLeftTab(id as SidebarSection)}
            collapsed={leftCollapsed}
            onCollapsedChange={onLeftCollapsed}
            tabs={DESTINATIONS.map((d) => ({
              id: d.id,
              label: d.label,
              description: d.description,
              icon: createElement(d.icon),
              content: content(d.id),
            }))}
          />
          {!leftCollapsed && <LeftResizeHandle width={leftWidth} onWidth={onLeftWidth} />}
          <button
            type="button"
            className="left-pane-chevron"
            aria-expanded={!leftCollapsed}
            aria-label={leftCollapsed ? 'Show project tools' : 'Hide project tools'}
            title={leftCollapsed ? 'Show the project tools' : 'Hide the project tools to give the views more room'}
            onClick={() => onLeftCollapsed(!leftCollapsed)}
          >
            <ChevronIcon towards={leftCollapsed ? 'right' : 'left'} />
          </button>
        </div>

        {view ? (
          <EditPanelOwnerContext.Provider value={editOwner}>
          {/* P4 G: the Data view's table edits through the same models and commands as Properties. */}
          <DataCellEditorContext.Provider value={TableCellEditor}>
            <div className={panelsClass} style={splitStyle(split) as CSSProperties}>
              {showDividers && <ViewportDivider axis="x" split={split} onSplit={changeSplit} />}
              {showDividers && viewports.layout === 4 && <ViewportDivider axis="y" split={split} onSplit={changeSplit} />}
              {mounted.map((index) => {
                const info = infos[index]!;
                return (
                  <PanelMemoryContext.Provider key={index} value={memories[index]!}>
                    <PanelIndexContext.Provider value={index}>
                      <ViewportCameraContext.Provider value={viewportCameras[index] ?? null}>
                      <ViewportDisplay mode={info.mode}>
                        <ViewPanel
                          onInteract={() => setLastPanel(index)}
                          {...view}
                          index={index}
                          mode={info.mode}
                          hidden={!info.visible}
                          onMode={(mode) => onViewports((s) => setViewportMode(s, index, mode))}
                          maximise={
                            canMaximise(viewports) ? (
                              <MaximiseButton maximised={viewports.maximised === index} onToggle={() => onViewports((s) => toggleMaximise(s, index))} />
                            ) : null
                          }
                          layout={index === layoutHost ? <LayoutSelect layout={viewports.layout} onLayout={(l) => onViewports((s) => setViewportLayout(s, l))} /> : null}
                        />
                      </ViewportDisplay>
                      </ViewportCameraContext.Provider>
                    </PanelIndexContext.Provider>
                  </PanelMemoryContext.Provider>
                );
              })}
            </div>
          </DataCellEditorContext.Provider>
          </EditPanelOwnerContext.Provider>
        ) : (
          <div className="panels panels-empty">{empty ?? <p className="meta">No design is open.</p>}</div>
        )}

        <div className="right-pane">
        {!rightCollapsed && <RightResizeHandle width={rightWidth} onWidth={changeRightWidth} />}
        <SidebarNav
          side="right"
          label="Properties"
          active="properties"
          onActive={() => {}}
          collapsed={rightCollapsed}
          onCollapsedChange={onRightCollapsed}
          tabs={[
            {
              id: 'properties',
              label: PROPERTIES_LABEL,
              description: PROPERTIES_DESCRIPTION,
              icon: <PropertiesIcon />,
              content: view ? <PropertiesPanel {...view} /> : <p className="meta">No design is open.</p>,
            },
          ]}
        />
        </div>
      </section>
    </AnalysisOverlayContext.Provider>
  );
}

/**
 * Vertical separator on the LEFT edge of the open Properties pane (owner 2026-11-20): drag or use the
 * arrow keys (ArrowLeft widens it). `width` null = the stylesheet's default, read from the pane itself.
 */
function RightResizeHandle({ width, onWidth }: { readonly width: number | null; readonly onWidth: (width: number, done: boolean) => void }) {
  const drag = useRef<{ readonly startX: number; readonly startWidth: number; last: number } | null>(null);
  const current = (el: HTMLElement) => width ?? el.parentElement?.getBoundingClientRect().width ?? RIGHT_WIDTH_MIN;
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = current(event.currentTarget);
    drag.current = { startX: event.clientX, startWidth: start, last: start };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const next = clampRightWidth(d.startWidth - (event.clientX - d.startX));
    if (next === d.last) return;
    d.last = next;
    onWidth(next, false);
  };
  const end = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    onWidth(d.last, true);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = keyboardRightResize(current(event.currentTarget), event.key);
    if (next === null) return;
    event.preventDefault();
    onWidth(next, true);
  };
  return (
    <div
      className="right-pane-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize Properties"
      {...(width !== null && { 'aria-valuenow': width })}
      aria-valuemin={RIGHT_WIDTH_MIN}
      aria-valuemax={RIGHT_WIDTH_MAX}
      title="Drag (or use the arrow keys) to resize"
      tabIndex={0}
      data-right-resize=""
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKeyDown}
    />
  );
}

/** Vertical separator on the right edge of the open left pane: drag or use the arrow keys. */
function LeftResizeHandle({ width, onWidth }: { readonly width: number; readonly onWidth: (width: number, done: boolean) => void }) {
  const drag = useRef<{ readonly startX: number; readonly startWidth: number; last: number } | null>(null);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: width, last: width };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const next = clampLeftWidth(d.startWidth + event.clientX - d.startX);
    if (next === d.last) return;
    d.last = next;
    onWidth(next, false);
  };
  const end = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    onWidth(d.last, true);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = keyboardResize(width, event.key);
    if (next === null) return;
    event.preventDefault();
    onWidth(next, true);
  };
  return (
    <div
      className="left-pane-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize project tools"
      aria-valuenow={width}
      aria-valuemin={LEFT_WIDTH_MIN}
      aria-valuemax={LEFT_WIDTH_MAX}
      title="Drag (or use the arrow keys) to resize"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKeyDown}
    />
  );
}

/**
 * A divider between the viewports (owner 2026-11-20): vertical (`x`, between the columns) or
 * horizontal (`y`, between the rows of layout 4). Drag it, use the arrow keys (Home: half), or
 * double-click it to share the space equally again.
 */
function ViewportDivider({ axis, split, onSplit }: { readonly axis: 'x' | 'y'; readonly split: ViewportSplit; readonly onSplit: (split: ViewportSplit, done: boolean) => void }) {
  const last = useRef<ViewportSplit | null>(null);
  const fraction = axis === 'x' ? split.x : split.y;
  const set = (value: number, done: boolean) => {
    const next = axis === 'x' ? { ...split, x: value } : { ...split, y: value };
    last.current = next;
    onSplit(next, done);
  };
  const fromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!box) return null;
    const gap = Number.parseFloat(getComputedStyle(event.currentTarget.parentElement!).columnGap) || 8;
    return axis === 'x' ? splitFromPointer(event.clientX, box.left, box.width, gap) : splitFromPointer(event.clientY, box.top, box.height, gap);
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    last.current = split;
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!last.current) return;
    const value = fromPointer(event);
    if (value !== null) set(value, false);
  };
  const end = () => {
    if (!last.current) return;
    onSplit(last.current, true);
    last.current = null;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = keyboardSplit(fraction, event.key, axis);
    if (next === null) return;
    event.preventDefault();
    set(next, true);
  };
  return (
    <div
      className={`viewport-divider viewport-divider-${axis}`}
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={axis === 'x' ? 'Resize the viewport columns' : 'Resize the viewport rows'}
      aria-valuenow={Math.round(fraction * 100)}
      aria-valuemin={15}
      aria-valuemax={85}
      title="Drag (or use the arrow keys) to resize the viewports; double-click to share the space equally"
      tabIndex={0}
      data-viewport-divider={axis}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => set(0.5, true)}
      onKeyDown={onKeyDown}
    />
  );
}

const LAYOUT_TITLES: Readonly<Record<ViewportLayout, string>> = {
  1: 'One viewport',
  2: 'Two viewports side by side',
  4: 'Four viewports',
};

function LayoutSelect({ layout, onLayout }: { readonly layout: ViewportLayout; readonly onLayout: (layout: ViewportLayout) => void }) {
  return (
    <div className="segmented" role="group" aria-label="Viewport layout">
      {VIEWPORT_LAYOUTS.map((l) => (
        <button key={l} type="button" aria-pressed={layout === l} onClick={() => onLayout(l)} title={LAYOUT_TITLES[l]}>
          {l}
        </button>
      ))}
    </div>
  );
}

function MaximiseButton({ maximised, onToggle }: { readonly maximised: boolean; readonly onToggle: () => void }) {
  return (
    <button
      type="button"
      className="viewport-maximise"
      aria-pressed={maximised}
      onClick={onToggle}
      title={maximised ? 'Show all viewports of the layout again' : 'Show only this viewport'}
    >
      {maximised ? 'Restore' : 'Maximise'}
    </button>
  );
}

function ViewPanel({
  index,
  mode,
  hidden,
  onMode,
  layout,
  maximise,
  onInteract,
  ...props
}: ViewProps & {
  /** Any pointer press inside the panel (makes it the panel that shows the room editor). */
  readonly onInteract: () => void;
  readonly index: ViewportIndex;
  readonly mode: ViewMode;
  /** Mounted but not shown (another viewport is maximised). */
  readonly hidden: boolean;
  readonly onMode: (mode: ViewMode) => void;
  /** Workspace-level controls shown at the right of this panel's header. */
  readonly layout: ReactNode;
  readonly maximise: ReactNode;
}) {
  const View = VIEW_COMPONENTS[mode];
  return (
    <div
      className="view-panel"
      data-panel={index}
      data-viewport={VIEWPORT_IDS[index]}
      data-view={mode}
      hidden={hidden}
      onPointerDownCapture={onInteract}
      onFocusCapture={onInteract}
    >
      <div className="panel-header">
        <ViewModeSelect mode={mode} onMode={onMode} panel={index + 1} />
        <span className="panel-caption" title={VIEW_CAPTIONS[mode]}>
          {VIEW_CAPTIONS[mode]}
        </span>
        <span className="panel-header-spacer" />
        {layout}
        {maximise}
      </div>
      <div className="view-body">
        {/* Keyed by mode: a mode switch never keeps the previous view mounted-but-hidden while the next one loads. */}
        <Suspense key={mode} fallback={<p className="meta view-loading">Loading the 3D view…</p>}>
          <View {...props} />
        </Suspense>
      </div>
    </div>
  );
}
