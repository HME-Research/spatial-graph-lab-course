import { useState, type ReactNode } from 'react';
import { AnalysisOverlayContext } from '@app/views/analysisOverlay';
import type { ViewMode, ViewProps } from '@app/views/contracts';
import { createPanelMemory, PanelMemoryContext, type PanelMemory } from '@app/views/panelMemory';
import type { AnalysisPresentation } from '@app/views/presentation';
import { AnalysisLegend } from '@app/views/presentation/LegendViews';
import { VIEW_COMPONENTS } from '@app/views/registry';
import { EditPanelOwnerContext, PanelIndexContext } from '@app/views/three/editing/editPanelOwner';
import {
  AlgorithmsIcon,
  AttributesIcon,
  DesignerIcon,
  ProjectIcon,
  PROPERTIES_DESCRIPTION,
  PROPERTIES_LABEL,
  PropertiesIcon,
  SIDEBAR_DESCRIPTIONS,
  SIDEBAR_LABELS,
  SIDEBAR_SECTIONS,
  SidebarNav,
  ViewModeSelect,
  type SidebarSection,
} from '@app/ui';
import { PropertiesPanel } from './inspector/Inspector';

const SECTION_ICONS = { project: <ProjectIcon />, attributes: <AttributesIcon />, designer: <DesignerIcon />, algorithms: <AlgorithmsIcon /> } as const;

/** View modes that show the room editor (snapped gizmo + edit panel). */
const EDITING_MODES: ReadonlySet<ViewMode> = new Set(['voxels', 'architecture']);

/** Viewport width below which the left content starts collapsed (rail only), keeping the canvas wide. */
export const LEFT_AUTO_COLLAPSE_BELOW = 1600;

export interface WorkspaceProps {
  /** The open design's view props; null when no design is open (the rails stay usable). */
  readonly view: ViewProps | null;
  /** Content of the four left destinations. */
  readonly sections: Readonly<Record<SidebarSection, ReactNode>>;
  readonly leftTab: SidebarSection;
  readonly onLeftTab: (tab: SidebarSection) => void;
  readonly leftCollapsed: boolean;
  readonly onLeftCollapsed: (collapsed: boolean) => void;
  readonly rightCollapsed: boolean;
  readonly onRightCollapsed: (collapsed: boolean) => void;
  /** Analysis values shown on the model (Stage 07 overlay), or null. Never part of the document. */
  readonly analysis?: AnalysisPresentation | null;
  readonly onClearAnalysis?: () => void;
  /** Shown in the centre when no design is open. */
  readonly empty?: ReactNode;
}

/**
 * Application workspace (programme phase 04):
 * - LEFT: a persistent vertical rail with exactly four destinations — Project, Attributes,
 *   Designer, Algorithms — whose content opens beside the rail and collapses back to the rail;
 * - CENTRE: one or two coordinated view panels (modes, single/split, per-panel camera memory);
 * - RIGHT: Properties of the selection only, collapsible to its own rail.
 *
 * Every section stays mounted while hidden (drafts, results and diagnostics survive switching
 * and collapsing). The second view panel is unmounted in single view; the first is never
 * remounted by a layout change. Rail and collapse state are owned by the shell (App), so the
 * header and Properties can open a destination.
 */
export function Workspace({
  view,
  sections,
  leftTab,
  onLeftTab,
  leftCollapsed,
  onLeftCollapsed,
  rightCollapsed,
  onRightCollapsed,
  analysis = null,
  onClearAnalysis,
  empty,
}: WorkspaceProps) {
  const [split, setSplit] = useState(true);
  const [modes, setModes] = useState<readonly [ViewMode, ViewMode]>(['graph2d', 'architecture']);
  const [memories] = useState<readonly [PanelMemory, PanelMemory]>(() => [createPanelMemory(), createPanelMemory()]);
  /** The panel last interacted with; decides which of two editing views shows the room editor. */
  const [lastPanel, setLastPanel] = useState<0 | 1>(1);

  const setMode = (index: 0 | 1, mode: ViewMode) => setModes((m) => (index === 0 ? [mode, m[1]] : [m[0], mode]));
  const panels: readonly (0 | 1)[] = split ? [0, 1] : [0];
  const editOwner = split && EDITING_MODES.has(modes[0]) && EDITING_MODES.has(modes[1]) ? lastPanel : null;

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

  return (
    <AnalysisOverlayContext.Provider value={analysis}>
      <section className={className} aria-label="Workspace">
        <SidebarNav
          side="left"
          label="project tools"
          active={leftTab}
          onActive={(id) => onLeftTab(id as SidebarSection)}
          collapsed={leftCollapsed}
          onCollapsedChange={onLeftCollapsed}
          tabs={SIDEBAR_SECTIONS.map((id) => ({
            id,
            label: SIDEBAR_LABELS[id],
            description: SIDEBAR_DESCRIPTIONS[id],
            icon: SECTION_ICONS[id],
            content: content(id),
          }))}
        />

        {view ? (
          <EditPanelOwnerContext.Provider value={editOwner}>
          <div className={split ? 'panels split' : 'panels'}>
            {panels.map((index) => (
              <PanelMemoryContext.Provider key={index} value={memories[index]}>
                <PanelIndexContext.Provider value={index}>
                <ViewPanel
                  onInteract={() => setLastPanel(index)}
                  {...view}
                  index={index}
                  mode={modes[index]}
                  onMode={(mode) => setMode(index, mode)}
                  layout={index === 0 ? <LayoutToggle split={split} onSplit={setSplit} /> : null}
                />
                </PanelIndexContext.Provider>
              </PanelMemoryContext.Provider>
            ))}
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

function LayoutToggle({ split, onSplit }: { readonly split: boolean; readonly onSplit: (split: boolean) => void }) {
  return (
    <div className="segmented" role="group" aria-label="Layout">
      <button type="button" aria-pressed={!split} onClick={() => onSplit(false)} title="One view">
        Single
      </button>
      <button type="button" aria-pressed={split} onClick={() => onSplit(true)} title="Two views side by side">
        Split
      </button>
    </div>
  );
}

function ViewPanel({
  index,
  mode,
  onMode,
  layout,
  onInteract,
  ...props
}: ViewProps & {
  /** Any pointer press inside the panel (makes it the panel that shows the room editor). */
  readonly onInteract: () => void;
  readonly index: 0 | 1;
  readonly mode: ViewMode;
  readonly onMode: (mode: ViewMode) => void;
  /** Workspace-level controls shown at the right of this panel's header. */
  readonly layout: ReactNode;
}) {
  const View = VIEW_COMPONENTS[mode];
  return (
    <div className="view-panel" data-panel={index} data-view={mode} onPointerDownCapture={onInteract}>
      <div className="panel-header">
        <ViewModeSelect mode={mode} onMode={onMode} panel={index + 1} />
        <span className="panel-header-spacer" />
        {layout}
      </div>
      <div className="view-body">
        <View {...props} />
      </div>
    </div>
  );
}
