import type { ExtensionDiagnostic } from '@app/extensions';
import { selectNode, type SelectionHandler } from '@core/viewer/selection';
import { activeProjectOf, projectHeadline, sessionDiagnostics, type ProjectSession } from './projectSession';

const ICON = { error: '✖', warning: '⚠', info: 'ℹ' } as const;

/**
 * The active project, its loading problems (persistent: never auto-dismissed), the project and
 * design menus and the current design's conformance checks.
 */
export function ProjectBar({
  session,
  docLoaded,
  source,
  modified,
  conformance,
  onSwitchProject,
  onOpenDesign,
  onSelect,
}: {
  /** null while a project is being activated. */
  readonly session: ProjectSession | null;
  readonly docLoaded: boolean;
  readonly source: string | null;
  readonly modified: boolean;
  readonly conformance: readonly ExtensionDiagnostic[];
  readonly onSwitchProject: (projectId: string) => void;
  readonly onOpenDesign: (designId: string) => void;
  readonly onSelect: SelectionHandler;
}) {
  if (!session) {
    return (
      <section className="project-bar" aria-busy="true">
        <span className="meta">Activating project…</span>
      </section>
    );
  }
  const headline = projectHeadline(session, docLoaded);
  const project = activeProjectOf(session);
  const problems = sessionDiagnostics(session);
  const errors = problems.filter((d) => d.severity === 'error').length;
  const selected = project?.id ?? (session.activation.status === 'failed' ? session.activation.projectId : '');
  const tally = (severity: ExtensionDiagnostic['severity']) => conformance.filter((d) => d.severity === severity).length;
  const checkErrors = tally('error');
  const checkWarnings = tally('warning');
  const notes = tally('info');
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  return (
    <section className={`project-bar tone-${headline.tone}`} aria-label="Project status">
      <div className="project-row">
        <label className="project-field">
          Project
          <select value={selected} onChange={(e) => onSwitchProject(e.currentTarget.value)} aria-label="Active project">
            {!session.available.includes(selected) && <option value={selected}>{selected || '(none)'}</option>}
            {session.available.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <strong className="project-name">
          {headline.tone === 'error' ? `${ICON.error} ` : ''}
          {headline.title}
        </strong>
        {project && project.designs.length > 0 && (
          <label className="project-field">
            Design
            <select
              value=""
              onChange={(e) => {
                const id = e.currentTarget.value;
                if (id) onOpenDesign(id);
              }}
              aria-label="Open a project design"
            >
              <option value="">Open a project design…</option>
              {project.designs.map((d) => (
                <option key={d.id} value={d.id} disabled={!d.result.ok}>
                  {d.id}
                  {d.result.ok ? '' : ' (invalid)'}
                </option>
              ))}
            </select>
          </label>
        )}
        {source && (
          <span className="meta project-source">
            <code>{source}</code>
            {modified && <span className="modified-badge"> · modified (not exported)</span>}
          </span>
        )}
      </div>
      {headline.detail && <p className="project-detail">{headline.detail}</p>}

      {problems.length > 0 && (
        <details className="project-problems" open={errors > 0}>
          <summary>
            Project problems ({problems.length}){errors > 0 ? ` — ${errors} error${errors === 1 ? '' : 's'}` : ''}
          </summary>
          <DiagnosticList diagnostics={problems} onSelect={onSelect} />
        </details>
      )}

      {docLoaded && project && conformance.length > 0 && (
        <details className="project-checks">
          <summary>
            Design checks against the project types: {checkErrors > 0 && `${plural(checkErrors, 'error')}, `}
            {plural(checkWarnings, 'warning')}, {plural(notes, 'note')}
          </summary>
          <DiagnosticList diagnostics={conformance} onSelect={onSelect} />
        </details>
      )}
    </section>
  );
}

function DiagnosticList({ diagnostics, onSelect }: { readonly diagnostics: readonly ExtensionDiagnostic[]; readonly onSelect: SelectionHandler }) {
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
