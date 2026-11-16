import type { ReactNode } from 'react';
import type { ExtensionDiagnostic } from '@app/extensions';
import { CollapsibleSection, InfoButton } from '@app/ui';
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
 * The **Project** destination (wave 1 A layout): three collapsible sections.
 * - **Project Files**: which project is open and the file actions (open, export, example). The
 *   project-file actions of workstream B (New, Save As New Project, Export Project) are mounted by
 *   the integration owner through `files`.
 * - **Information**: project and current design, with the Project/Scenario concept.
 * - **Advanced** (collapsed): where the design came from and every check with its code.
 * Problems that need action (errors, warnings) open a Checks section; info notes stay in Advanced.
 * Scenario management is NOT here: it is the Scenarios destination.
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
  files,
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
  /** Optional project-file actions (workstream B), shown first in Project Files. */
  readonly files?: ReactNode;
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
  const selected = project?.id ?? (session.activation.status === 'failed' ? session.activation.projectId : '');
  const actionable = [...problems, ...(docLoaded && project ? conformance : [])].filter((d) => d.severity !== 'info');
  const errors = actionable.filter((d) => d.severity === 'error').length;
  const tally = (severity: ExtensionDiagnostic['severity']) => conformance.filter((d) => d.severity === severity).length;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  return (
    <div className={`sgl-project sgl-inspector tone-${headline.tone}`}>
      <CollapsibleSection title="Project Files" sectionId="project-files">
        {files}
        <label className="sgl-form-row sgl-stacked">
          <span>Active project</span>
          <select value={selected} onChange={(e) => onSwitchProject(e.currentTarget.value)} aria-label="Active project">
            {!session.available.includes(selected) && <option value={selected}>{selected || '(none)'}</option>}
            {session.available.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        {project && project.designs.length > 0 && (
          <label className="sgl-form-row sgl-stacked">
            <span>Open a project design</span>
            <select
              value=""
              onChange={(e) => {
                const id = e.currentTarget.value;
                if (id) onOpenDesign(id);
              }}
              aria-label="Open a project design"
            >
              <option value="">Choose a design…</option>
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
          <button type="button" onClick={onOpenFile} title="Open a design JSON file (schema v1 or v2) from your computer">
            Open JSON…
          </button>
          <button type="button" disabled={!docLoaded} onClick={onExport} title="Download the open design as schema-v2 JSON">
            Export JSON
          </button>
          <button type="button" onClick={onLoadExample} title="Replace the open design with the built-in two-storey example">
            Load example
          </button>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Information" sectionId="project-information" actions={<InfoButton concept="project-scenario" />}>
        <dl className="sgl-readonly-list">
          <dt>Project</dt>
          <dd className="sgl-project-name">
            {headline.tone === 'error' ? `${ICON.error} ` : ''}
            {headline.title}
          </dd>
          <dt>Design</dt>
          <dd>{docLoaded ? designName : <span className="meta">none open</span>}</dd>
          {docLoaded && (
            <>
              <dt>State</dt>
              <dd className="sgl-project-state" title="Compared with the last Export Project (or the file the project was opened from)">{modified ? 'Not exported' : 'Exported'}</dd>
            </>
          )}
        </dl>
        {headline.detail && <p className="sgl-help">{headline.detail}</p>}
        <p className="sgl-help">Projects are saved in this browser automatically; Export Project keeps a file copy.</p>
      </CollapsibleSection>

      {actionable.length > 0 && (
        <CollapsibleSection title="Checks" sectionId="project-checks" meta={errors > 0 ? plural(errors, 'error') : plural(actionable.length, 'warning')}>
          <div aria-live="polite">
            <DiagnosticList diagnostics={actionable} onSelect={onSelect} />
          </div>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Advanced" sectionId="project-advanced" defaultOpen={false} variant="advanced">
        {source && (
          <p className="sgl-help sgl-source" title="Where the open design was loaded from">
            Loaded from <code>{source}</code>
          </p>
        )}
        <p className="sgl-help">The project’s attribute fields are saved in this browser automatically.</p>
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
              Design checks: {tally('error') > 0 && `${plural(tally('error'), 'error')}, `}
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
