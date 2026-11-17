import type { ReactNode } from 'react';
import type { ExtensionDiagnostic } from '@app/extensions';
import { CollapsibleSection } from '@app/ui';
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
 * The **Project** destination (UI refinement 2026-11-17). The project is the container of
 * scenarios, shared attributes and project information, so this panel manages only that:
 * - `overview` (supplied by the shell): name, save state, the project actions and information;
 * - **Checks**, only while something needs attention;
 * - **Advanced** (collapsed): the course project, where the open scenario came from, and every
 *   message with its code.
 * Scenario management lives in Scenarios. Nothing here exposes design-level files.
 */
export function ProjectPanel({
  session,
  overview,
  docLoaded,
  source,
  conformance,
  attributeProblems,
  onSelect,
  library,
}: {
  /** Project-level libraries supplied by the shell (Imported façades), after the overview. */
  readonly library?: ReactNode;
  /** null while the course project is being activated. */
  readonly session: ProjectSession | null;
  readonly overview: ReactNode;
  readonly docLoaded: boolean;
  /** Where the open scenario's design was loaded from (Advanced only). */
  readonly source: string | null;
  readonly conformance: readonly ExtensionDiagnostic[];
  /** Project attribute storage problems (and a failed save, as a diagnostic). */
  readonly attributeProblems: readonly ExtensionDiagnostic[];
  readonly onSelect: SelectionHandler;
}) {
  const project = session ? activeProjectOf(session) : null;
  const problems = session ? [...sessionDiagnostics(session), ...attributeProblems] : [];
  const actionable = [...problems, ...(docLoaded && project ? conformance : [])].filter((d) => d.severity !== 'info');
  const errors = actionable.filter((d) => d.severity === 'error').length;
  const tally = (severity: ExtensionDiagnostic['severity']) => conformance.filter((d) => d.severity === severity).length;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const headline = session ? projectHeadline(session, docLoaded) : null;

  return (
    <div className={`sgl-project sgl-inspector${headline ? ` tone-${headline.tone}` : ''}`} aria-busy={session === null ? 'true' : undefined}>
      {overview}

      {library}

      {headline?.tone === 'error' && (
        <p className="sgl-warning" role="alert">
          {ICON.error} {headline.title}
        </p>
      )}

      {actionable.length > 0 && (
        <CollapsibleSection title="Checks" sectionId="project-checks" meta={errors > 0 ? plural(errors, 'error') : plural(actionable.length, 'warning')}>
          <div aria-live="polite">
            <DiagnosticList diagnostics={actionable} onSelect={onSelect} />
          </div>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Advanced" sectionId="project-advanced" defaultOpen={false} variant="advanced">
        <dl className="sgl-readonly-list">
          <dt>Course project</dt>
          <dd>{project ? project.definition.name : session ? <span className="meta">none</span> : <span className="meta">loading…</span>}</dd>
          {source && (
            <>
              <dt>Scenario source</dt>
              <dd className="sgl-source">
                <code>{source}</code>
              </dd>
            </>
          )}
        </dl>
        {headline?.detail && <p className="sgl-help">{headline.detail}</p>}
        {problems.length === 0 && conformance.length === 0 && <p className="meta">No problems.</p>}
        {problems.length > 0 && (
          <details className="project-problems">
            <summary>Project messages ({problems.length})</summary>
            <DiagnosticList diagnostics={problems} onSelect={onSelect} />
          </details>
        )}
        {docLoaded && project && conformance.length > 0 && (
          <details className="project-checks">
            <summary>
              Scenario checks: {tally('error') > 0 && `${plural(tally('error'), 'error')}, `}
              {plural(tally('warning'), 'warning')}, {plural(tally('info'), 'note')}
            </summary>
            <DiagnosticList diagnostics={conformance} onSelect={onSelect} />
          </details>
        )}
      </CollapsibleSection>
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
