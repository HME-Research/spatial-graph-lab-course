import type { ReactNode } from 'react';
import type { Explainer } from '../guideContracts';
import { FloatingWindow } from '../floating';
import './guide.css';

/** DOM id of a Guide section (an Explainer block) so a GuideLink can scroll to it. */
export const sectionDomId = (id: string) => `guide-section-${id}`;

/**
 * One explainer block: title, then the one-sentence summary (strongest), the example, an optional
 * diagram slot and an optional "Learn more" link (new tab). `renderDiagram` maps `explainer.diagram`
 * (a diagram id) to a component; without it the slot is left empty.
 */
export function ExplainerView({
  explainer,
  renderDiagram,
  headingLevel = 3,
}: {
  readonly explainer: Explainer;
  readonly renderDiagram?: ((diagramId: string) => ReactNode) | undefined;
  readonly headingLevel?: 2 | 3 | 4;
}) {
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  return (
    <article className="sgl-explainer" id={sectionDomId(explainer.id)} data-explainer={explainer.id}>
      <Heading className="sgl-explainer-title">{explainer.title}</Heading>
      <p className="sgl-explainer-summary">{explainer.summary}</p>
      <p className="sgl-explainer-example">
        <span className="sgl-explainer-label">Example</span> {explainer.example}
      </p>
      {explainer.diagram !== undefined && (
        <div className="sgl-explainer-diagram" data-diagram={explainer.diagram}>
          {renderDiagram?.(explainer.diagram)}
        </div>
      )}
      {explainer.learnMore && (
        <p className="sgl-explainer-more">
          <a href={explainer.learnMore.url} target="_blank" rel="noopener noreferrer">
            Learn more: {explainer.learnMore.label}
          </a>
        </p>
      )}
    </article>
  );
}

/** A FloatingWindow showing one Explainer (for the analysis items' info buttons). */
export function ExplainerWindow({
  explainer,
  open,
  onClose,
  renderDiagram,
}: {
  readonly explainer: Explainer;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly renderDiagram?: ((diagramId: string) => ReactNode) | undefined;
}) {
  return (
    <FloatingWindow id={`explainer-${explainer.id}`} title={explainer.title} open={open} onClose={onClose} initialSize={{ width: 360, height: 300 }}>
      <div className="sgl-guide-pad">
        <ExplainerView explainer={explainer} renderDiagram={renderDiagram} headingLevel={2} />
      </div>
    </FloatingWindow>
  );
}
