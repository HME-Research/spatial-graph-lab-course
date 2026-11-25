import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { nextTabIndex } from './navigation';
import './ui.css';

export interface SidebarNavTab {
  /** Stable id, used for element ids (`sidebar-tab-<id>`, `sidebar-panel-<id>`). */
  readonly id: string;
  /** Full visible label, e.g. "Properties". */
  readonly label: string;
  /** Tooltip; also the accessible description. */
  readonly description: string;
  /** Decorative icon (hidden from assistive technology; the label names the tab). */
  readonly icon: ReactNode;
  readonly content: ReactNode;
  /** Small marker after the label, e.g. "soon". Optional. */
  readonly badge?: string;
}

export interface SidebarNavProps {
  readonly tabs: readonly SidebarNavTab[];
  readonly active: string;
  readonly onActive: (id: string) => void;
  /** Collapsed: only the rail is shown (destinations keep their icon and visible label). */
  readonly collapsed: boolean;
  readonly onCollapsedChange: (collapsed: boolean) => void;
  /** Accessible name of the whole sidebar. */
  readonly label?: string;
  /** Which window edge the rail sits on (default right). The rail is always on the outer edge. */
  readonly side?: 'left' | 'right';
  /**
   * Show a collapse button in the rail. Default: only on the right. The LEFT pane is collapsed by
   * the host's centred chevron (Workspace), so a second Show/Hide control there would duplicate it.
   */
  readonly collapseToggle?: boolean;
}

/**
 * Sidebar with VERTICAL destination navigation (Gate F rail) or, with exactly one tab, a single
 * titled panel without a tab strip (Properties: no redundant tab).
 *
 * - Several tabs: the rail sits on the outer edge; every destination has an icon and an
 *   always-visible label. Keyboard: Tab focuses the active destination; ArrowUp/ArrowDown/Home/End
 *   move between destinations.
 * - One tab: the panel shows its title and a collapse button; collapsed, a slim strip keeps one
 *   labelled button that opens it again (`#sidebar-tab-<id>`).
 * - Every panel stays mounted while hidden, so switching or collapsing keeps drafts, algorithm
 *   results and diagnostics.
 *
 * Layout only; the host (Workspace) decides the grid width.
 */
export function SidebarNav(props: SidebarNavProps) {
  return props.tabs.length === 1 ? <SinglePanel {...props} tab={props.tabs[0]!} /> : <TabbedRail {...props} />;
}

const CHEVRON_PROPS = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** Chevron pointing `towards` the direction the pane will move. */
export function ChevronIcon({ towards }: { readonly towards: 'left' | 'right' }) {
  return (
    <svg {...CHEVRON_PROPS} aria-hidden="true">
      <path d={towards === 'left' ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5 10.5 8 6 12.5'} />
    </svg>
  );
}

function SinglePanel({ tab, collapsed, onCollapsedChange, label = 'Sidebar', side = 'right' }: SidebarNavProps & { readonly tab: SidebarNavTab }) {
  const outward = side === 'right' ? 'right' : 'left';
  const inward = side === 'right' ? 'left' : 'right';
  return (
    <aside className={`sgl-sidenav sgl-sidenav-single side-${side}${collapsed ? ' collapsed' : ''}`} aria-label={label}>
      {collapsed && (
        <div className="sgl-sidenav-strip">
          <button
            type="button"
            id={`sidebar-tab-${tab.id}`}
            className="sgl-sidenav-tab"
            aria-expanded={false}
            aria-controls={`sidebar-panel-${tab.id}`}
            aria-label={`Show ${tab.label}`}
            title={`Show ${tab.label}: ${tab.description}`}
            onClick={() => onCollapsedChange(false)}
          >
            <span className="sgl-sidenav-icon" aria-hidden="true">
              {tab.icon}
            </span>
            <span className="sgl-sidenav-label">{tab.label}</span>
            <span className="sgl-sidenav-icon sgl-sidenav-expand" aria-hidden="true">
              <ChevronIcon towards={inward} />
            </span>
          </button>
        </div>
      )}
      <div className="sgl-sidenav-panels" hidden={collapsed}>
        <div role="region" id={`sidebar-panel-${tab.id}`} aria-labelledby={`sidebar-heading-${tab.id}`} className="sgl-sidenav-panel" hidden={collapsed}>
          <div className="sgl-sidenav-panel-head">
            <h2 id={`sidebar-heading-${tab.id}`} className="sgl-sidenav-heading">
              {tab.label}
            </h2>
            <button
              type="button"
              className="sgl-icon-button"
              aria-expanded={!collapsed}
              aria-controls={`sidebar-panel-${tab.id}`}
              aria-label={`Hide ${tab.label}`}
              title={`Hide ${tab.label} to give the views more room`}
              onClick={() => onCollapsedChange(true)}
            >
              <ChevronIcon towards={outward} />
            </button>
          </div>
          {tab.content}
        </div>
      </div>
    </aside>
  );
}

function TabbedRail({ tabs, active, onActive, collapsed, onCollapsedChange, label = 'Sidebar', side = 'right', collapseToggle = side === 'right' }: SidebarNavProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === active),
  );

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = nextTabIndex(
      event.key,
      index,
      tabs.map(() => false),
    );
    if (next === null) return;
    event.preventDefault();
    const tab = tabs[next];
    if (!tab) return;
    onActive(tab.id);
    buttons.current[next]?.focus();
  };

  const panels = (
    <div className="sgl-sidenav-panels" hidden={collapsed}>
      {tabs.map((tab, i) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`sidebar-panel-${tab.id}`}
          aria-labelledby={`sidebar-tab-${tab.id}`}
          className="sgl-sidenav-panel"
          hidden={collapsed || i !== activeIndex}
        >
          <h2 className="sgl-sidenav-heading">{tab.label}</h2>
          {tab.content}
        </div>
      ))}
    </div>
  );
  const strip = (
    <nav className="sgl-sidenav-strip" aria-label={`${label} sections`}>
      <div role="tablist" aria-orientation="vertical" aria-label={`${label} sections`} className="sgl-sidenav-tabs">
        {tabs.map((tab, i) => {
          const selected = i === activeIndex;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                buttons.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`sidebar-tab-${tab.id}`}
              aria-selected={selected && !collapsed}
              aria-controls={`sidebar-panel-${tab.id}`}
              aria-label={collapsed ? `${tab.label} (opens the panel)` : tab.label}
              tabIndex={selected ? 0 : -1}
              title={tab.description}
              className={selected && !collapsed ? 'sgl-sidenav-tab active' : 'sgl-sidenav-tab'}
              onKeyDown={(e) => onKeyDown(e, i)}
              onClick={() => {
                onActive(tab.id);
                if (collapsed) onCollapsedChange(false);
              }}
            >
              <span className="sgl-sidenav-icon" aria-hidden="true">
                {tab.icon}
              </span>
              <span className="sgl-sidenav-label">{tab.label}</span>
              {tab.badge !== undefined && <span className="sgl-sidenav-badge">{tab.badge}</span>}
            </button>
          );
        })}
      </div>
      {collapseToggle && (
        <button
          type="button"
          className="sgl-sidenav-toggle"
          aria-expanded={!collapsed}
          title={collapsed ? `Show ${label}` : `Hide ${label} to give the views more room`}
          aria-label={collapsed ? `Show ${label}` : `Hide ${label}`}
          onClick={() => onCollapsedChange(!collapsed)}
        >
          <ChevronIcon towards={(side === 'right') === collapsed ? 'left' : 'right'} />
        </button>
      )}
    </nav>
  );
  return (
    <aside className={`sgl-sidenav side-${side}${collapsed ? ' collapsed' : ''}`} aria-label={label}>
      {side === 'left' ? strip : panels}
      {side === 'left' ? panels : strip}
    </aside>
  );
}

const ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** Sliders: properties of the selection. */
export const PropertiesIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M3 5h8M15 5h2M3 10h2M9 10h8M3 15h10M17 15h0" />
    <circle cx="13" cy="5" r="2" />
    <circle cx="7" cy="10" r="2" />
    <circle cx="15" cy="15" r="2" />
  </svg>
);

/** Folder: the project, its designs and files. */
export const ProjectIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M2.5 5.5a1 1 0 0 1 1-1h4l1.6 1.8h7.4a1 1 0 0 1 1 1v8.2a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" />
  </svg>
);

/** Tag with lines: custom attribute fields. */
export const AttributesIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M3 4h7l7 7-6 6-7-7z" />
    <circle cx="6.5" cy="7.5" r="1.2" />
  </svg>
);

/** Small graph under a magnifier: analyse (reads the graph). */
export const AnalyseIcon = () => (
  <svg {...ICON_PROPS}>
    <circle cx="4" cy="5" r="1.8" />
    <circle cx="4" cy="14" r="1.8" />
    <path d="M5.6 5.8l3.2 2.4M5.6 13.2l3.2-2.4" />
    <circle cx="12" cy="9.5" r="3.6" />
    <path d="M14.6 12.2l3.4 3.6" />
  </svg>
);

/** Small graph growing a new node: transform (changes the design). */
export const TransformIcon = () => (
  <svg {...ICON_PROPS}>
    <circle cx="4.5" cy="5" r="2" />
    <circle cx="4.5" cy="15" r="2" />
    <circle cx="15.5" cy="10" r="2" strokeDasharray="2 1.6" />
    <path d="M6.3 6l7.4 3.2M6.3 14l7.4-3.2" />
  </svg>
);

/** Façade with windows: designer. */
export const DesignerIcon = () => (
  <svg {...ICON_PROPS}>
    <rect x="3" y="3" width="14" height="14" rx="1" />
    <path d="M3 8h14M10 8v9M6 11h1.5M12.5 11H14M6 14h1.5M12.5 14H14" />
  </svg>
);

/** Two stacked sheets: design alternatives (scenarios). */
export const ScenariosIcon = () => (
  <svg {...ICON_PROPS}>
    <rect x="6" y="3" width="11" height="11" rx="1" />
    <path d="M3 7v9a1 1 0 0 0 1 1h9" />
  </svg>
);

/** Camera body with lens: saved camera views. */
export const CameraIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M2.5 7a1 1 0 0 1 1-1h2.5l1.5-2h5l1.5 2h2.5a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z" />
    <circle cx="10" cy="11" r="3" />
  </svg>
);

/** Eye: how the views are displayed. */
export const DisplayIcon = () => (
  <svg {...ICON_PROPS}>
    <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" />
    <circle cx="10" cy="10" r="2.5" />
  </svg>
);
