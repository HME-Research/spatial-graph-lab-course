import { useState, type ReactNode } from 'react';
import type { Explainer, GuideDownload } from '../guideContracts';
import { FloatingWindow } from '../floating';
import { renderGuideDiagram } from './diagrams';
import './guide.css';

/** DOM id of a Guide section (an Explainer block) so a GuideLink can scroll to it. */
export const sectionDomId = (id: string) => `guide-section-${id}`;

/**
 * One explainer block: title, then the one-sentence summary (strongest), the example, an optional
 * diagram, an optional screenshot of the app with numbered markers, downloads and an optional
 * "Learn more" link (new tab). `renderDiagram` maps `explainer.diagram` (a diagram id) to a
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

/**
 * Save a file: a served file through a plain download link (`href`, binary allowed), or a text
 * file loaded on click and handed to the browser as a download (nothing is uploaded).
 */
function DownloadButton({ download }: { readonly download: GuideDownload }) {
  const [problem, setProblem] = useState<string | null>(null);
  const note = download.note ? <span className="sgl-explainer-download-note"> — {download.note}</span> : null;
  if ('href' in download) {
    return (
      <>
        <a className="sgl-explainer-download" href={download.href} download={download.fileName} data-download={download.fileName}>
          ⤓ {download.label}
        </a>
        {note}
      </>
    );
  }
  const load = download.load;
  const save = async () => {
    setProblem(null);
    try {
      const text = await load();
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = download.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setProblem(`Could not load ${download.fileName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  return (
    <>
      <button type="button" className="sgl-explainer-download" data-download={download.fileName} onClick={() => void save()}>
        ⤓ {download.label}
      </button>
      {note}
      {problem && <span className="sgl-error"> {problem}</span>}
    </>
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
