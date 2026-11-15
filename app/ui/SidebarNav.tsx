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
  /** Collapsed: only the icon strip is shown (icons keep their tooltip and accessible name). */
  readonly collapsed: boolean;
  readonly onCollapsedChange: (collapsed: boolean) => void;
  /** Accessible name of the whole sidebar. */
  readonly label?: string;
}

/**
 * Right-hand sidebar with VERTICAL section navigation (Properties / Algorithms / Designer).
 *
 * - The strip sits on the outer (right) edge; labels are horizontal and fully readable.
 * - Every panel stays mounted while hidden, so switching sections or collapsing the sidebar keeps
 *   drafts, algorithm results and persistent diagnostics.
 * - Keyboard: Tab focuses the active section; ArrowUp/ArrowDown/Home/End move between sections.
 *
 * Layout only; the host (Workspace) decides its grid width with `--sidebar-width`.
 */
export function SidebarNav({ tabs, active, onActive, collapsed, onCollapsedChange, label = 'Sidebar' }: SidebarNavProps) {
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

  return (
    <aside className={collapsed ? 'sgl-sidenav collapsed' : 'sgl-sidenav'} aria-label={label}>
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
                aria-label={collapsed ? `${tab.label} (opens the sidebar)` : tab.label}
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
        <button
          type="button"
          className="sgl-sidenav-toggle"
          aria-expanded={!collapsed}
          title={collapsed ? 'Show the sidebar' : 'Hide the sidebar to give the views more room'}
          aria-label={collapsed ? 'Show the sidebar' : 'Hide the sidebar'}
          onClick={() => onCollapsedChange(!collapsed)}
        >
          <span aria-hidden="true">{collapsed ? '«' : '»'}</span>
          <span className="sgl-sidenav-label">{collapsed ? 'Show' : 'Hide'}</span>
        </button>
      </nav>
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

/** Small graph being transformed: algorithms. */
export const AlgorithmsIcon = () => (
  <svg {...ICON_PROPS}>
    <circle cx="4.5" cy="5" r="2" />
    <circle cx="4.5" cy="15" r="2" />
    <circle cx="15.5" cy="10" r="2" />
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
