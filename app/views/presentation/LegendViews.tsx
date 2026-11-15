import type { AnalysisPresentation } from './analysis';
import type { LegendItem, Swatch, ViewLegend } from './legend';
import { WARNING_TONE } from './vocabulary';
import './presentation.css';

/**
 * Presentational legends (no state, no document access). Each item has a one-sentence summary
 * shown on hover AND keyboard focus (`title` + visible-on-focus text); each section has one optional "More
 * details" native disclosure, so keyboard users get the same help as mouse users.
 * `helpDetails` maps help topic ids to longer text (pass `HELP_TOPICS` details from app/ui/help, or
 * omit to show summaries only; views may not import the shell layer directly).
 */

function SwatchIcon({ swatch }: { readonly swatch: Swatch }) {
  if (swatch.shape === 'line') {
    const { line } = swatch;
    return (
      <svg className="sgl-pres-swatch" width="34" height="14" viewBox="0 0 34 14" aria-hidden="true">
        <line
          x1="2"
          y1="7"
          x2="32"
          y2="7"
          stroke={line.color}
          strokeWidth={line.width2d}
          strokeLinecap="round"
          {...(line.dash2d ? { strokeDasharray: line.dash2d } : {})}
        />
        {line.marker === 'route-ring' && <circle cx="17" cy="7" r="3.5" fill="#ffffff" stroke={line.color} strokeWidth="1.5" />}
      </svg>
    );
  }
  if (swatch.shape === 'ring') {
    return (
      <svg className="sgl-pres-swatch" width="34" height="14" viewBox="0 0 34 14" aria-hidden="true">
        <rect x="11" y="1.5" width="12" height="11" rx="2" fill="#ffffff" stroke={swatch.color} strokeWidth="2.5" />
      </svg>
    );
  }
  const p = swatch.pattern;
  return (
    <svg className="sgl-pres-swatch" width="34" height="14" viewBox="0 0 34 14" aria-hidden="true">
      <rect x="4" y="9" width="26" height="3" fill={swatch.color} stroke="#8a826f" strokeWidth="0.8" />
      {(p === 'enclosed' || p === 'covered') && <rect x="4" y="2" width="26" height="2" fill="#8a826f" />}
      {p === 'enclosed' && (
        <>
          <rect x="4" y="2" width="2" height="10" fill="#8a826f" />
          <rect x="28" y="2" width="2" height="10" fill="#8a826f" />
        </>
      )}
    </svg>
  );
}

function Item({ item }: { readonly item: LegendItem }) {
  return (
    <li className="sgl-pres-item" data-legend-item={item.id} tabIndex={0} title={item.summary} aria-label={`${item.label}: ${item.summary}`}>
      <SwatchIcon swatch={item.swatch} />
      <span className="sgl-pres-label">
        {item.glyph && <span aria-hidden="true">{item.glyph} </span>}
        {item.label}
        {item.count !== undefined && <span className="sgl-pres-count"> ({item.count})</span>}
      </span>
      <span className="sgl-pres-summary">{item.summary}</span>
    </li>
  );
}

/** One "More details" disclosure per section (its distinct help topics), not one per item. */
function SectionDetails({ items, helpDetails }: { readonly items: readonly LegendItem[]; readonly helpDetails?: Readonly<Record<string, string>> | undefined }) {
  const texts = [...new Set(items.map((i) => i.helpTopic).filter((t): t is string => t !== undefined))]
    .map((t) => helpDetails?.[t])
    .filter((t): t is string => t !== undefined);
  if (texts.length === 0) return null;
  return (
    <details className="sgl-pres-details">
      <summary>More details</summary>
      {texts.map((t) => (
        <p key={t}>{t}</p>
      ))}
    </details>
  );
}

export function RelationshipLegend({
  legend,
  helpDetails,
  defaultOpen = true,
}: {
  readonly legend: ViewLegend;
  readonly helpDetails?: Readonly<Record<string, string>>;
  readonly defaultOpen?: boolean;
}) {
  return (
    <details className="sgl-pres-legend" data-legend-view={legend.view} open={defaultOpen}>
      <summary>{legend.title}</summary>
      {legend.sections.map((s) => (
        <section key={s.id} className="sgl-pres-section" aria-label={s.title}>
          <h5>{s.title}</h5>
          <ul>
            {s.items.map((item) => (
              <Item key={item.id} item={item} />
            ))}
          </ul>
          <SectionDetails items={s.items} helpDetails={helpDetails} />
        </section>
      ))}
    </details>
  );
}

/** Legend for the analysis overlay; includes a Clear action and the stale warning. */
export function AnalysisLegend({
  presentation,
  onClear,
}: {
  readonly presentation: AnalysisPresentation;
  readonly onClear?: () => void;
}) {
  const { scale } = presentation;
  return (
    <section className={presentation.stale ? 'sgl-pres-analysis stale' : 'sgl-pres-analysis'} aria-label={`Analysis: ${presentation.title}`} data-analysis-stale={presentation.stale}>
      <header>
        <h5>Analysis: {presentation.title}</h5>
        {onClear && (
          <button type="button" className="sgl-pres-clear" onClick={onClear}>
            Clear
          </button>
        )}
      </header>
      {presentation.staleMessage && (
        <p className="sgl-pres-stale" role="status" style={{ borderColor: WARNING_TONE.border }}>
          <span aria-hidden="true">{WARNING_TONE.icon} </span>
          {presentation.staleMessage}
        </p>
      )}
      {presentation.summary && <p className="sgl-pres-summary-text">{presentation.summary}</p>}
      {scale && (
        <div className="sgl-pres-scale" aria-label={`Scale from ${scale.min} to ${scale.max}`}>
          <span>{scale.min}</span>
          <span className="sgl-pres-gradient" aria-hidden="true" />
          <span>{scale.max}</span>
        </div>
      )}
      <ul>
        {presentation.legend.map((e) => (
          <li key={e.label} className="sgl-pres-item" data-analysis-missing={e.missing === true}>
            <span className="sgl-pres-chip" style={{ background: e.color }} aria-hidden="true" />
            <span className="sgl-pres-label">
              {e.label} <span className="sgl-pres-count">({e.count})</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="sgl-pres-note">Analysis colours are temporary and are not saved in the design.</p>
    </section>
  );
}
