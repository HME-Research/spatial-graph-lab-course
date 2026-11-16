import { useId, useState, type ReactNode } from 'react';
import './ui.css';

export interface CollapsibleSectionProps {
  /** Visible heading text. */
  readonly title: ReactNode;
  readonly children: ReactNode;
  /** Initially open (default true). The open state is kept by the component afterwards. */
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
}

/**
 * Collapsible section (WAI-ARIA disclosure pattern): the heading contains one button with
 * `aria-expanded` / `aria-controls`; the body stays MOUNTED while collapsed (`hidden`), so drafts
 * and local state survive collapsing. Sections nest: use `level={4}` inside a level-3 section.
 */
export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  level = 3,
  actions,
  meta,
  variant = 'default',
  className,
  sectionId,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const bodyId = `${id}-body`;
  const Heading = level === 3 ? 'h3' : 'h4';
  const classes = ['sgl-csection', `sgl-csection-l${level}`, variant !== 'default' ? `sgl-csection-${variant}` : '', open ? 'open' : 'closed', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <section className={classes} data-section={sectionId}>
      <div className="sgl-csection-head">
        <Heading className="sgl-csection-title">
          <button type="button" className="sgl-csection-toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)}>
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
