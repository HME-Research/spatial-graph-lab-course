import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { nextTabIndex } from './navigation';
import './ui.css';

export interface TabItem<T extends string> {
  readonly id: T;
  readonly label: ReactNode;
  /** Tooltip. */
  readonly description?: string;
}

/**
 * Horizontal tabs (WAI-ARIA tabs, automatic activation): ArrowLeft/ArrowRight/Home/End move
 * between tabs; Tab moves into the panel. The host renders the active panel's content as children.
 */
export function HorizontalTabs<T extends string>({
  tabs,
  active,
  onActive,
  label,
  children,
}: {
  readonly tabs: readonly TabItem<T>[];
  readonly active: T;
  readonly onActive: (id: T) => void;
  /** Accessible name of the tab list. */
  readonly label: string;
  readonly children: ReactNode;
}) {
  const base = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const tabId = (id: T) => `${base}-tab-${id}`;
  const panelId = `${base}-panel`;
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const target = tabKeyTarget(event.key, index, tabs.map((t) => t.id));
    if (!target) return;
    event.preventDefault();
    onActive(target.id);
    buttons.current[target.index]?.focus();
  };
  return (
    <div className="sgl-htabs">
      <div role="tablist" aria-orientation="horizontal" aria-label={label} className="sgl-htabs-list">
        {tabs.map((tab, i) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                buttons.current[i] = el;
              }}
              type="button"
              role="tab"
              id={tabId(tab.id)}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              title={tab.description}
              className={selected ? 'sgl-htab active' : 'sgl-htab'}
              onKeyDown={(e) => onKeyDown(e, i)}
              onClick={() => onActive(tab.id)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={tabId(active)} className="sgl-htabs-panel">
        {children}
      </div>
    </div>
  );
}

/**
 * Keyboard behaviour of the horizontal tabs (pure): which tab an arrow, Home or End key activates
 * and focuses, or null when the key is not a tab-list key (Tab, ArrowUp, letters …).
 */
export function tabKeyTarget<T extends string>(key: string, index: number, ids: readonly T[]): { readonly id: T; readonly index: number } | null {
  const next = nextTabIndex(key, index, ids.map(() => false), 'horizontal');
  if (next === null) return null;
  const id = ids[next];
  return id === undefined ? null : { id, index: next };
}
