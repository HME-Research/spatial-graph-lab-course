import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import './ui.css';

export interface CollapsibleSectionProps {
  /** Visible heading text. */
  readonly title: ReactNode;
  readonly children: ReactNode;
  /**
   * Initially open when the user never chose (default false: collapsed). With a `sectionId`, the
   * user's open/closed choice is remembered in this browser and wins over this default.
   */
  readonly defaultOpen?: boolean;
  /** Heading level of the title (default 3: panel content under the panel's h2). */
  readonly level?: 3 | 4;
  /** Controls after the heading that must not toggle the section (e.g. an `i` button, a link). */
  readonly actions?: ReactNode;
  /** Short muted text after the title, e.g. a count ("3"). */
  readonly meta?: ReactNode;
  /** Visual variant: `calculated` marks read-only derived content. */
  readonly variant?: 'default' | 'calculated' | 'advanced';
  readonly className?: string;
  /** Stable hook for tests and the smoke harness. */
  readonly sectionId?: string;
  /**
   * Reveal request: each NEW value (a counter; 0 or absent = none) opens the section (remembered
   * like a click) and scrolls it into view, e.g. after something was added to it.
   */
  readonly reveal?: number;
}

/** The toggle button press (pure): collapse an open section, open a collapsed one. */
export const toggleSection = (open: boolean): boolean => !open;

/** `localStorage` key of a remembered section (`sgl:ui:*`, like the side panes). */
export const sectionStorageKey = (id: string): string => `sgl:ui:section:${id}`;

/** The part of `Storage` the sections use. */
export interface SectionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): SectionStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** The remembered open state of section `id` ('1' / '0'), or `fallback` (no id, never chosen, storage refused). */
export function readSectionOpen(id: string | undefined, fallback: boolean, storage: SectionStorage | null = browserStorage()): boolean {
  if (id === undefined || !storage) return fallback;
  try {
    const value = storage.getItem(sectionStorageKey(id));
    return value === '1' ? true : value === '0' ? false : fallback;
  } catch {
    return fallback;
  }
}

/** Remember the user's choice for section `id` (best effort: a refused storage simply forgets). */
export function writeSectionOpen(id: string | undefined, open: boolean, storage: SectionStorage | null = browserStorage()): void {
  if (id === undefined || !storage) return;
  try {
    storage.setItem(sectionStorageKey(id), open ? '1' : '0');
  } catch {
    // Forget silently.
  }
}

/**
 * Open state of a disclosure that STICKS: it starts from the user's last choice for `id` (in this
 * browser), else `defaultOpen`; every toggle is remembered. Without an id it is only local state.
 */
export function useRememberedOpen(id: string | undefined, defaultOpen: boolean): readonly [boolean, () => void, () => void] {
  const [open, setOpen] = useState(() => readSectionOpen(id, defaultOpen));
  const toggle = () =>
    setOpen((current) => {
      const next = toggleSection(current);
      writeSectionOpen(id, next);
      return next;
    });
  /** Open it (remembered, like the user opening it). */
  const openNow = () => {
    writeSectionOpen(id, true);
    setOpen(true);
  };
  return [open, toggle, openNow] as const;
}

/** Whether a `reveal` prop value is a new reveal request (pure). */
export const isNewReveal = (previous: number | undefined, next: number | undefined): boolean => next !== undefined && next !== 0 && next !== previous;

/**
 * Collapsible section (WAI-ARIA disclosure pattern): the heading contains one button with
 * `aria-expanded` / `aria-controls`; the body stays MOUNTED while collapsed (`hidden`), so drafts
 * and local state survive collapsing. Sections nest: use `level={4}` inside a level-3 section.
 */
export function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
  level = 3,
  actions,
  meta,
  variant = 'default',
  className,
  sectionId,
  reveal,
}: CollapsibleSectionProps) {
  // Collapsed by default; once the user opens or closes a section (by `sectionId`), that choice sticks.
  const [open, toggle, openNow] = useRememberedOpen(sectionId, defaultOpen);
  const sectionRef = useRef<HTMLElement>(null);
  const lastReveal = useRef(reveal);
  useEffect(() => {
    const isNew = isNewReveal(lastReveal.current, reveal);
    lastReveal.current = reveal;
    if (!isNew) return;
    openNow();
    // After the section has opened (next frame), bring it into view.
    const frame = requestAnimationFrame(() => sectionRef.current?.scrollIntoView({ block: 'nearest' }));
    return () => cancelAnimationFrame(frame);
    // Only a new reveal value acts; `openNow` is recreated each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal]);
  const id = useId();
  const bodyId = `${id}-body`;
  const Heading = level === 3 ? 'h3' : 'h4';
  const classes = ['sgl-csection', `sgl-csection-l${level}`, variant !== 'default' ? `sgl-csection-${variant}` : '', open ? 'open' : 'closed', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <section ref={sectionRef} className={classes} data-section={sectionId}>
      <div className="sgl-csection-head">
        <Heading className="sgl-csection-title">
          <button type="button" className="sgl-csection-toggle" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
            <svg className="sgl-csection-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M4 2.5 7.5 6 4 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="sgl-csection-text">{title}</span>
            {meta !== undefined && <span className="sgl-csection-meta">{meta}</span>}
          </button>
        </Heading>
        {actions !== undefined && <div className="sgl-csection-actions">{actions}</div>}
      </div>
      <div id={bodyId} className="sgl-csection-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
