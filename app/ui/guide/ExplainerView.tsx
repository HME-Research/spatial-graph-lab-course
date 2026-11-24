import type { ReactNode } from 'react';
import type { Explainer } from '../guideContracts';
import { FloatingWindow, sizedWindowId } from '../floating';
import { AiKitTabs } from './AiKitTabs';
import { ToolkitKitTabs } from './ToolkitKitTabs';
import { DownloadButton } from './DownloadButton';
import { renderGuideDiagram } from './diagrams';
import './guide.css';

/** DOM id of a Guide section (an Explainer block) so a GuideLink can scroll to it. */
export const sectionDomId = (id: string) => `guide-section-${id}`;

/**
 * One explainer block: title, then the one-sentence summary (strongest), the example, an optional
 * pair of contrasting diagrams (side by side, each with its caption), an optional single
 * diagram, an optional screenshot of the app with numbered markers, downloads, the AI kit tabs
 * (`aiKits`), the toolkit kit tabs (`toolkitKit`) and an optional "Learn more" link (new tab). `renderDiagram` maps `explainer.diagram` (a diagram id) to a
 * component; it defaults to the Guide diagrams (`diagrams.tsx`).
 */
export function ExplainerView({
  explainer,
  renderDiagram = renderGuideDiagram,
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
      {explainer.diagrams && (
        <div className="sgl-explainer-pair" data-diagrams={explainer.diagrams.map((c) => c.diagram).join(' ')}>
          {explainer.diagrams.map((c) => (
            <figure key={c.diagram} className="sgl-explainer-case" data-diagram={c.diagram}>
              <div className="sgl-explainer-case-img">{renderDiagram?.(c.diagram)}</div>
              <figcaption>{c.caption}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {explainer.diagram !== undefined && (
        <div className="sgl-explainer-diagram" data-diagram={explainer.diagram}>
          {renderDiagram?.(explainer.diagram)}
        </div>
      )}
      {explainer.screenshot && <Screenshot shot={explainer.screenshot} />}
      {explainer.downloads && explainer.downloads.length > 0 && (
        <ul className="sgl-explainer-downloads" aria-label="Downloads">
          {explainer.downloads.map((d) => (
            <li key={d.fileName}>
              <DownloadButton download={d} />
            </li>
          ))}
        </ul>
      )}
      {explainer.aiKits && <AiKitTabs />}
      {explainer.toolkitKit && <ToolkitKitTabs />}
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

/**
 * A screenshot of the real app (captured by scripts/guide-shots.mjs) with the numbered markers drawn
 * over it, at fractions of the image size, so they stay in place at any width. The markers repeat
 * the numbers of the entry's steps; the alt text names what each number points at.
 */
function Screenshot({ shot }: { readonly shot: NonNullable<Explainer['screenshot']> }) {
  return (
    <figure className="sgl-explainer-shot">
      <div className="sgl-explainer-shot-frame">
        <img src={shot.src} alt={shot.alt} loading="lazy" decoding="async" />
        {shot.markers.map((m) => (
          <span key={m.n} className="sgl-guide-marker" aria-hidden="true" data-marker={m.n} style={{ left: `${(m.x * 100).toFixed(2)}%`, top: `${(m.y * 100).toFixed(2)}%` }}>
            {m.n}
          </span>
        ))}
      </div>
      <figcaption>In the app (numbers match the steps above)</figcaption>
    </figure>
  );
}

/** Opening size of an explainer's pop-up when it sets no `windowSize` (owner 2026-11-20: bigger, room for two diagrams). */
export const DEFAULT_EXPLAINER_WINDOW_SIZE = { width: 520, height: 480 } as const;

/**
 * Id of an explainer's window (its place and size are remembered by it): `explainer-<id>@<w>x<h>`,
 * the opening size included, so a new opening size is not hidden by an older remembered one (e.g. a
 * small window that a student had moved to the top right under the old id `explainer-<id>`).
 */
export const explainerWindowId = (explainer: Pick<Explainer, 'id' | 'windowSize'>): string =>
  sizedWindowId(`explainer-${explainer.id}`, explainer.windowSize ?? DEFAULT_EXPLAINER_WINDOW_SIZE);

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
  const size = explainer.windowSize ?? DEFAULT_EXPLAINER_WINDOW_SIZE;
  return (
    <FloatingWindow id={explainerWindowId(explainer)} title={explainer.title} open={open} onClose={onClose} initialSize={size}>
      <div className="sgl-guide-pad">
        <ExplainerView explainer={explainer} renderDiagram={renderDiagram} headingLevel={2} />
      </div>
    </FloatingWindow>
  );
}
