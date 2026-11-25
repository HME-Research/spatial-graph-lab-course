import type { ReactNode } from 'react';
import { HelpTip } from '@app/ui/help';
import { useGuide } from '@app/ui/guide';
import { sectionInfo, type AttributeSectionId, type PropertiesSectionId } from './sections';
import { LockIcon } from './FunctionsDialog';
import './attributes.css';

/** Guide anchor of a section's explainer ("More in the guide →"). */
export const sectionGuideAnchor = (section: AttributeSectionId): string => `section-${section}`;

/**
 * One of the five attribute sections (Programme P4, `sections.ts`), used by the Attributes panel
 * and Properties alike: a thin divider line, a small title and an ⓘ with the section's summary and
 * a "More in the guide →" link. Never collapsible.
 */
export function AttributeSection({
  section,
  actions,
  children,
}: {
  readonly section: PropertiesSectionId;
  /** Optional actions at the right of the title (e.g. "Manage attributes"). */
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}) {
  const guide = useGuide();
  const info = sectionInfo(section);
  // The Corridor section (Properties only) is explained in the Guide under Geometry.
  const anchor = sectionGuideAnchor(section === 'corridor' ? 'geometry' : section);
  return (
    <section className="sgl-attr-section" data-attribute-section={section} aria-label={info.title}>
      <div className="sgl-attr-section-head">
        <h4 className="sgl-attr-section-title">{info.title}</h4>
        <HelpTip mark="i" topic={{ id: `section-${section}`, title: info.title, summary: info.summary, details: '' }}>
          <button type="button" className="sgl-link sgl-guide-more" onClick={() => guide.open({ tab: 'attributes', section: anchor })}>
            More in the guide →
          </button>
        </HelpTip>
        {actions !== undefined && <span className="sgl-attr-section-actions">{actions}</span>}
      </div>
      {children}
    </section>
  );
}

/** The lock shown on rows that cannot be edited or removed (Identity, Calculated; built-ins in Attributes). */
export function RowLock({ title }: { readonly title: string }) {
  return (
    <span className="sgl-attr-lock" role="img" aria-label={title} title={title}>
      <LockIcon />
    </span>
  );
}
