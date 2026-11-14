import { useState, type ReactNode } from 'react';
import { VIEW_MODE_LABELS, VIEW_MODES, type ViewMode, type ViewProps } from '@app/views/contracts';
import { createPanelMemory, PanelMemoryContext, type PanelMemory } from '@app/views/panelMemory';
import { VIEW_COMPONENTS } from '@app/views/registry';
import { Inspector } from './inspector/Inspector';

type SidebarTab = 'inspector' | 'algorithms';

const TAB_LABELS: Readonly<Record<SidebarTab, string>> = { inspector: 'Inspector', algorithms: 'Algorithms' };

/**
 * Viewport host: one or two view panels sharing the same document, selection and command handler,
 * and a sidebar with the inspector and the algorithm panel (`algorithms`) as tabs.
 *
 * Layout state lives here, not in the panels: each panel's view mode and its view memory (camera /
 * diagram viewport) survive switching between single and split view. The second panel is unmounted
 * in single view, so no hidden renderer keeps running; the first panel is never remounted by a
 * layout change. Both sidebar tabs stay mounted, so switching tabs or collapsing the sidebar keeps
 * drafts and algorithm results.
 */
export function Workspace({ algorithms, ...props }: ViewProps & { readonly algorithms?: ReactNode }) {
  const [split, setSplit] = useState(true);
  const [modes, setModes] = useState<readonly [ViewMode, ViewMode]>(['graph2d', 'architecture']);
  const [memories] = useState<readonly [PanelMemory, PanelMemory]>(() => [createPanelMemory(), createPanelMemory()]);
  const [tab, setTab] = useState<SidebarTab>('inspector');
  const [collapsed, setCollapsed] = useState(false);

  const setMode = (index: 0 | 1, mode: ViewMode) => setModes((m) => (index === 0 ? [mode, m[1]] : [m[0], mode]));
  const panels: readonly (0 | 1)[] = split ? [0, 1] : [0];

  return (
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

      <aside className="sidebar" aria-label="Inspector and algorithms">
        <div className="sidebar-header">
          {collapsed ? null : (
            <div className="sidebar-tabs" role="tablist" aria-label="Sidebar">
              {(['inspector', 'algorithms'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  id={`sidebar-tab-${t}`}
                  aria-selected={tab === t}
                  aria-controls={`sidebar-panel-${t}`}
                  className={tab === t ? 'sidebar-tab active' : 'sidebar-tab'}
                  onClick={() => setTab(t)}
                >
                  {TAB_LABELS[t]}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className="sidebar-toggle"
            aria-expanded={!collapsed}
            title={collapsed ? 'Show the sidebar' : 'Hide the sidebar'}
            aria-label={collapsed ? 'Show the sidebar' : 'Hide the sidebar'}
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? '«' : '»'}
          </button>
        </div>
        {collapsed && (
          <div className="sidebar-rail">
            {(['inspector', 'algorithms'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className="sidebar-rail-tab"
                title={`Show the ${TAB_LABELS[t].toLowerCase()}`}
                onClick={() => {
                  setTab(t);
                  setCollapsed(false);
                }}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
        )}
        {(['inspector', 'algorithms'] as const).map((t) => (
          <div
            key={t}
            role="tabpanel"
            id={`sidebar-panel-${t}`}
            aria-labelledby={`sidebar-tab-${t}`}
            className="sidebar-body"
            hidden={collapsed || tab !== t}
          >
            {t === 'inspector' ? <Inspector {...props} /> : algorithms}
          </div>
        ))}
      </aside>
    </section>
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
    <div className="view-panel" data-panel={index}>
      <div className="panel-header">
        <select value={mode} onChange={(e) => onMode(e.currentTarget.value as ViewMode)} aria-label={`View mode, panel ${index + 1}`}>
          {VIEW_MODES.map((m) => (
            <option key={m} value={m}>
              {VIEW_MODE_LABELS[m]}
            </option>
          ))}
        </select>
        <span className="panel-header-spacer" />
        {layout}
      </div>
      <div className="view-body">
        <View {...props} />
      </div>
    </div>
  );
}
