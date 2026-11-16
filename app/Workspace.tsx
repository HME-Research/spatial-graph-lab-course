import { useCallback, useState, type ReactNode } from 'react';
import { OpenAttributesContext } from '@app/attributes/navigation';
import type { AttributeCollection } from '@app/extensions';
import { AnalysisOverlayContext } from '@app/views/analysisOverlay';
import type { ViewMode, ViewProps } from '@app/views/contracts';
import { createPanelMemory, PanelMemoryContext, type PanelMemory } from '@app/views/panelMemory';
import type { AnalysisPresentation } from '@app/views/presentation';
import { AnalysisLegend } from '@app/views/presentation/LegendViews';
import { VIEW_COMPONENTS } from '@app/views/registry';
import {
  AlgorithmsIcon,
  AttributesIcon,
  DesignerIcon,
  DesignerPlaceholder,
  PropertiesIcon,
  SIDEBAR_DESCRIPTIONS,
  SIDEBAR_LABELS,
  SIDEBAR_SECTIONS,
  SidebarNav,
  ViewModeSelect,
  type SidebarSection,
} from '@app/ui';
import { PropertiesPanel } from './inspector/Inspector';

const SIDEBAR_ICONS = { properties: <PropertiesIcon />, attributes: <AttributesIcon />, algorithms: <AlgorithmsIcon />, designer: <DesignerIcon /> } as const;

export interface WorkspaceProps extends ViewProps {
  readonly algorithms?: ReactNode;
  /** The Designer panel; without it the Stage 05 placeholder is shown. */
  readonly designer?: ReactNode;
  /** Analysis values shown on the model (Stage 07 overlay), or null. Never part of the document. */
  readonly analysis?: AnalysisPresentation | null;
  readonly onClearAnalysis?: () => void;
  /** The project Attributes manager, given the shown sub-list (Nodes/Edges) and a setter. */
  readonly attributes?: (collection: AttributeCollection, onCollection: (c: AttributeCollection) => void) => ReactNode;
}

/**
 * Viewport host: one or two view panels sharing the same document, design port, selection and
 * command handler, and a sidebar with vertical sections: Properties, Algorithms and Designer.
 *
 * Layout state lives here, not in the panels: each panel's view mode and its view memory (camera /
 * diagram viewport) survive switching between single and split view. The second panel is unmounted
 * in single view, so no hidden renderer keeps running; the first panel is never remounted by a
 * layout change. All sidebar sections stay mounted (SidebarNav hides inactive ones), so switching
 * sections or collapsing the sidebar keeps drafts and algorithm results.
 */
export function Workspace({ algorithms, designer, analysis = null, onClearAnalysis, attributes, ...props }: WorkspaceProps) {
  const [split, setSplit] = useState(true);
  const [modes, setModes] = useState<readonly [ViewMode, ViewMode]>(['graph2d', 'architecture']);
  const [memories] = useState<readonly [PanelMemory, PanelMemory]>(() => [createPanelMemory(), createPanelMemory()]);
  const [tab, setTab] = useState<SidebarSection>('properties');
  const [collapsed, setCollapsed] = useState(false);
  const [attributeCollection, setAttributeCollection] = useState<AttributeCollection>('nodes');
  const openAttributes = useCallback((collection: AttributeCollection) => {
    setAttributeCollection(collection);
    setTab('attributes');
    setCollapsed(false);
  }, []);

  const setMode = (index: 0 | 1, mode: ViewMode) => setModes((m) => (index === 0 ? [mode, m[1]] : [m[0], mode]));
  const panels: readonly (0 | 1)[] = split ? [0, 1] : [0];

  const algorithmsSection = (
    <>
      {analysis && <AnalysisLegend presentation={analysis} {...(onClearAnalysis && { onClear: onClearAnalysis })} />}
      {algorithms}
    </>
  );

  return (
    <OpenAttributesContext.Provider value={attributes ? openAttributes : null}>
    <AnalysisOverlayContext.Provider value={analysis}>
      <section className={collapsed ? 'workspace sidebar-collapsed' : 'workspace'} aria-label="Workspace">
        <div className={split ? 'panels split' : 'panels'}>
          {panels.map((index) => (
            <PanelMemoryContext.Provider key={index} value={memories[index]}>
              <ViewPanel
                {...props}
                index={index}
                mode={modes[index]}
                onMode={(mode) => setMode(index, mode)}
                layout={index === 0 ? <LayoutToggle split={split} onSplit={setSplit} /> : null}
              />
            </PanelMemoryContext.Provider>
          ))}
        </div>

        <SidebarNav
          label="Properties, algorithms and designer"
          active={tab}
          onActive={(id) => setTab(id as SidebarSection)}
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
          tabs={SIDEBAR_SECTIONS.map((id) => ({
            id,
            label: SIDEBAR_LABELS[id],
            description: SIDEBAR_DESCRIPTIONS[id],
            icon: SIDEBAR_ICONS[id],
            content:
              id === 'properties'
                ? <PropertiesPanel {...props} />
                : id === 'attributes'
                  ? (attributes?.(attributeCollection, setAttributeCollection) ?? <p className="meta">No active project.</p>)
                  : id === 'algorithms'
                    ? algorithmsSection
                    : (designer ?? <DesignerPlaceholder />),
            ...(id === 'designer' && designer === undefined && { badge: 'soon' }),
          }))}
        />
      </section>
    </AnalysisOverlayContext.Provider>
    </OpenAttributesContext.Provider>
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
  ...props
}: ViewProps & {
  readonly index: 0 | 1;
  readonly mode: ViewMode;
  readonly onMode: (mode: ViewMode) => void;
  /** Workspace-level controls shown at the right of this panel's header. */
  readonly layout: ReactNode;
}) {
  const View = VIEW_COMPONENTS[mode];
  return (
    <div className="view-panel" data-panel={index} data-view={mode}>
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
