import type { ExtensionDiagnostic } from '@app/extensions';
import { selectNode, type SelectionHandler } from '@core/viewer/selection';
import { activeProjectOf, projectHeadline, sessionDiagnostics, type ProjectSession } from './projectSession';

const ICON = { error: '✖', warning: '⚠', info: 'ℹ' } as const;

export interface ProjectStatus {
  /** Errors and warnings to point at from the header (info notes are not counted). */
  readonly problems: number;
  readonly errors: number;
}

/** Problems worth a header badge: project loading problems and design checks (not info notes). */
export function projectStatus(session: ProjectSession | null, conformance: readonly ExtensionDiagnostic[], extra: readonly ExtensionDiagnostic[] = []): ProjectStatus {
  const all = [...(session ? sessionDiagnostics(session) : []), ...conformance, ...extra].filter((d) => d.severity !== 'info');
  return { problems: all.length, errors: all.filter((d) => d.severity === 'error').length };
}

/**
 * The **Project** section of the left rail (programme phase 04): which project and design are
 * open, opening/loading/exporting designs, and every persistent problem — project loading
 * problems (never auto-dismissed), project attribute storage problems and the design's checks.
 * Replaces the former full-width project bar; the header keeps only a short identity.
 */
export function ProjectPanel({
  session,
  docLoaded,
  source,
  designName,
  modified,
  conformance,
  attributeProblems,
  onSwitchProject,
  onOpenDesign,
  onSelect,
  onLoadExample,
  onOpenFile,
  onExport,
}: {
  /** null while a project is being activated. */
  readonly session: ProjectSession | null;
  readonly docLoaded: boolean;
  readonly source: string | null;
  readonly designName: string | null;
  readonly modified: boolean;
  readonly conformance: readonly ExtensionDiagnostic[];
  /** Project attribute storage problems (and a failed save, as a diagnostic). */
  readonly attributeProblems: readonly ExtensionDiagnostic[];
  readonly onSwitchProject: (projectId: string) => void;
  readonly onOpenDesign: (designId: string) => void;
  readonly onSelect: SelectionHandler;
  readonly onLoadExample: () => void;
  readonly onOpenFile: () => void;
  readonly onExport: () => void;
}) {
  if (!session) {
    return (
      <div className="sgl-project sgl-inspector" aria-busy="true">
        <p className="meta">Activating project…</p>
      </div>
    );
  }
  const headline = projectHeadline(session, docLoaded);
  const project = activeProjectOf(session);
  const problems = [...sessionDiagnostics(session), ...attributeProblems];
  const errors = problems.filter((d) => d.severity === 'error').length;
  const selected = project?.id ?? (session.activation.status === 'failed' ? session.activation.projectId : '');
  const tally = (severity: ExtensionDiagnostic['severity']) => conformance.filter((d) => d.severity === severity).length;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  return (
    <div className={`sgl-project sgl-inspector tone-${headline.tone}`}>
      <section className="sgl-section">
        <h4>Project</h4>
        <label className="sgl-form-row">
          Active project
          <select value={selected} onChange={(e) => onSwitchProject(e.currentTarget.value)} aria-label="Active project">
            {!session.available.includes(selected) && <option value={selected}>{selected || '(none)'}</option>}
            {session.available.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <p className="sgl-project-name">
          {headline.tone === 'error' ? `${ICON.error} ` : ''}
          <strong>{headline.title}</strong>
        </p>
        {headline.detail && <p className="sgl-help">{headline.detail}</p>}
      </section>

      <section className="sgl-section">
        <h4>Design</h4>
        {docLoaded ? (
          <p>
            <strong>{designName}</strong> {modified ? <span className="modified-badge">modified (not exported)</span> : <span className="meta">saved state</span>}
          </p>
        ) : (
          <p className="meta">No design is open.</p>
        )}
        {source && (
          <p className="sgl-help sgl-source" title="Where the open design was loaded from">
            From <code>{source}</code>
          </p>
        )}
        {project && project.designs.length > 0 && (
          <label className="sgl-form-row">
            Open
            <select
              value=""
              onChange={(e) => {
                const id = e.currentTarget.value;
                if (id) onOpenDesign(id);
              }}
              aria-label="Open a project design"
            >
              <option value="">a project design…</option>
              {project.designs.map((d) => (
                <option key={d.id} value={d.id} disabled={!d.result.ok}>
                  {d.id}
                  {d.result.ok ? '' : ' (invalid)'}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="sgl-buttons">
          <button type="button" onClick={onLoadExample} title="Replace the open design with the built-in two-storey example">
            Load example
          </button>
          <button type="button" onClick={onOpenFile} title="Open a design JSON file (schema v1 or v2) from your computer">
            Open JSON…
          </button>
          <button type="button" disabled={!docLoaded} onClick={onExport} title="Download the open design as schema-v2 JSON">
            Export JSON
          </button>
        </div>
        <p className="sgl-help">Designs are saved by exporting them; the project’s attribute fields are saved in this browser automatically.</p>
      </section>

      <section className="sgl-section" aria-live="polite">
        <h4>Checks</h4>
        {problems.length === 0 && conformance.length === 0 && <p className="meta">No problems.</p>}
        {problems.length > 0 && (
          <details className="project-problems" open={problems.some((d) => d.severity !== 'info')}>
            <summary>
              Project problems ({problems.length}){errors > 0 ? ` — ${errors} error${errors === 1 ? '' : 's'}` : ''}
            </summary>
            <DiagnosticList diagnostics={problems} onSelect={onSelect} />
          </details>
        )}
        {docLoaded && project && conformance.length > 0 && (
          <details className="project-checks">
            <summary>
              Design checks: {tally('error') > 0 && `${plural(tally('error'), 'error')}, `}
              {plural(tally('warning'), 'warning')}, {plural(tally('info'), 'note')}
            </summary>
            <DiagnosticList diagnostics={conformance} onSelect={onSelect} />
          </details>
        )}
      </section>
    </div>
  );
}

export function DiagnosticList({ diagnostics, onSelect }: { readonly diagnostics: readonly ExtensionDiagnostic[]; readonly onSelect: SelectionHandler }) {
  return (
    <ul className="diagnostic-list">
      {diagnostics.map((d) => {
        const nodeId = d.subject.kind === 'node' ? d.subject.id : null;
        return (
          <li key={d.id} className={`diagnostic-${d.severity}`}>
            {ICON[d.severity]}{' '}
            {nodeId !== null && (
              <button type="button" className="link-button" title="Select this node" onClick={() => onSelect(selectNode(nodeId))}>
                {nodeId}
              </button>
            )}{' '}
            {d.message} <span className="code">({d.code})</span>
          </li>
        );
      })}
    </ul>
  );
}
