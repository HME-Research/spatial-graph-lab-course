import { createElement, Suspense, useContext, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { AnalysisOverlayContext } from '@app/views/analysisOverlay';
import type { ViewMode, ViewProps } from '@app/views/contracts';
import { createPanelMemory, PanelMemoryContext, type PanelMemory } from '@app/views/panelMemory';
import type { AnalysisPresentation } from '@app/views/presentation';
import { AnalysisLegend } from '@app/views/presentation/LegendViews';
import { VIEW_COMPONENTS } from '@app/views/registry';
import { EditPanelOwnerContext, PanelIndexContext } from '@app/views/three/editing/editPanelOwner';
import { ViewportCameraContext, type ViewportCamera } from '@app/views/viewportCamera';
import { ViewportDisplay } from '@app/display/DisplayProvider';
import { ChevronIcon, PROPERTIES_DESCRIPTION, PROPERTIES_LABEL, PropertiesIcon, SidebarNav, VIEW_CAPTIONS, ViewModeSelect, type SidebarSection } from '@app/ui';
import { DESTINATIONS } from '@app/workspace/destinations';
import { clampLeftWidth, keyboardResize, LEFT_WIDTH_MAX, LEFT_WIDTH_MIN } from '@app/workspace/panes';
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
    id === 'algorithms' ? (
      <>
        {analysis && <AnalysisLegend presentation={analysis} {...(onClearAnalysis && { onClear: onClearAnalysis })} />}
        {sections.algorithms}
      </>
    ) : (
      sections[id]
    );

  const className = ['workspace', leftCollapsed ? 'left-collapsed' : 'left-open', rightCollapsed ? 'right-collapsed' : 'right-open'].join(' ');
  const panelsClass = ['panels', `layout-${viewports.layout}`, viewports.maximised !== null ? 'maximised' : ''].filter(Boolean).join(' ');

  return (
    <AnalysisOverlayContext.Provider value={analysis}>
      <section className={className} aria-label="Workspace" style={{ '--left-width': `${leftWidth}px` } as CSSProperties}>
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
            <div className={panelsClass}>
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
          </EditPanelOwnerContext.Provider>
        ) : (
          <div className="panels panels-empty">{empty ?? <p className="meta">No design is open.</p>}</div>
        )}

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
      </section>
    </AnalysisOverlayContext.Provider>
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
