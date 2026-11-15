import { useState, type FormEvent } from 'react';
import type { ActiveProject, AttributeSpec, ExtensionDiagnostic, TransformationPreview } from '@app/extensions';
import { selectNode, type SelectionHandler } from '@core/viewer/selection';
import {
  analysisRows,
  describePreview,
  formatValue,
  isStale,
  listAlgorithms,
  parameterProblems,
  runEntry,
  type AlgorithmEntry,
  type AlgorithmRun,
  type ApplyOutcome,
  type ParameterDrafts,
} from './algorithmSession';
import type { DocumentVersion } from './documentSession';

/**
 * Compact algorithm controls: list, parameters, run, and the result. Analyses only display
 * values. Transformations produce a validated preview that changes the design only on an explicit
 * Apply (refused if the design changed since the run); Discard drops it. Nothing runs
 * automatically.
 */
export function AlgorithmPanel({
  project,
  version,
  onApply,
  onSelect,
}: {
  readonly project: ActiveProject | null;
  /** The current document and its revision; results are bound to it. */
  readonly version: DocumentVersion | null;
  /** Apply a preview to the current design (atomic, stale-checked). */
  readonly onApply: (preview: TransformationPreview, ranAt: number, label: string) => ApplyOutcome;
  readonly onSelect: SelectionHandler;
}) {
  const algorithms = listAlgorithms(project);
  // Selected by file: ids may collide (duplicate definitions are listed separately, both disabled).
  const [selectedFile, setSelectedFile] = useState<string | null>(() => algorithms.find((a) => a.enabled)?.file ?? algorithms[0]?.file ?? null);
  const [drafts, setDrafts] = useState<Readonly<Record<string, ParameterDrafts>>>({});
  const [run, setRun] = useState<AlgorithmRun | null>(null);
  const [notice, setNotice] = useState<{ readonly tone: 'ok' | 'error'; readonly text: string } | null>(null);

  const selectedIndex = algorithms.findIndex((a) => a.file === selectedFile);
  const selected = selectedIndex >= 0 ? algorithms[selectedIndex]! : null;
  const entryDrafts = (selected && drafts[selected.id]) ?? {};
  const problems = selected?.enabled ? parameterProblems(selected, entryDrafts) : [];

  if (!project) {
    return (
      <div className="algorithms sgl-inspector">
        <p className="meta">No active project. Algorithms come from <code>projects/&lt;id&gt;/algorithms/</code>.</p>
      </div>
    );
  }

  const execute = (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !selected.enabled || !version) return;
    setNotice(null);
    setRun(runEntry(version, project, selected, entryDrafts));
  };

  const apply = (preview: TransformationPreview) => {
    if (!run) return;
    const outcome = onApply(preview, run.revision, run.label);
    if (outcome.ok) {
      setRun(null);
      setNotice({ tone: 'ok', text: `Applied “${run.label}”: ${preview.operations.length} operation(s).` });
    } else setNotice({ tone: 'error', text: outcome.message });
  };

  return (
    <div className="algorithms sgl-inspector">
      {algorithms.length === 0 ? (
        <p className="meta">
          Project “{project.id}” has no algorithms. Add one in <code>projects/{project.id}/algorithms/</code>.
        </p>
      ) : (
        <ul className="algorithm-list" role="listbox" aria-label="Algorithms">
          {algorithms.map((a, i) => (
            <li key={a.file}>
              <button
                type="button"
                role="option"
                aria-selected={i === selectedIndex}
                className={i === selectedIndex ? 'algorithm-item selected' : 'algorithm-item'}
                onClick={() => {
                  setSelectedFile(a.file);
                  setRun(null);
                  setNotice(null);
                }}
              >
                <span className="algorithm-label">{a.label}</span>
                <span className={`algorithm-tag ${a.enabled ? a.scope : 'disabled'}`}>{a.enabled ? scopeLabel(a) : 'disabled'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <form className="sgl-section" onSubmit={execute}>
          <p className="sgl-help">
            <code>{selected.id}</code> · <code>{selected.file}</code>
          </p>
          {!selected.enabled && (
            <div className="sgl-error">
              ✖ This algorithm is disabled because its definition is invalid:
              <ul className="sgl-list">
                {selected.problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {selected.parameters.length > 0 && <h4>Parameters</h4>}
          {selected.parameters.map(([key, spec]) => (
            <ParameterField
              key={`${selected.id}:${key}`}
              name={key}
              spec={spec}
              draft={entryDrafts[key] ?? ''}
              onChange={(value) => setDrafts({ ...drafts, [selected.id]: { ...entryDrafts, [key]: value } })}
            />
          ))}
          <DiagnosticLines diagnostics={problems} />
          <div className="sgl-buttons">
            <button type="submit" disabled={!selected.enabled || problems.length > 0 || !version}>
              Run
            </button>
            {selected.scope === 'spatial' && selected.enabled && <span className="sgl-help">Shows a preview; nothing changes until you apply it.</span>}
          </div>
        </form>
      )}

      {notice && <p className={notice.tone === 'ok' ? 'algorithm-notice' : 'sgl-error'}>{notice.text}</p>}
      {run && <RunResult run={run} version={version} onApply={apply} onDiscard={() => setRun(null)} onSelect={onSelect} />}
    </div>
  );
}

const scopeLabel = (a: AlgorithmEntry) => (a.scope === 'graph' ? 'analysis' : a.scope === 'spatial' ? 'transformation' : a.scope);

function ParameterField({
  name,
  spec,
  draft,
  onChange,
}: {
  readonly name: string;
  readonly spec: AttributeSpec;
  readonly draft: string;
  readonly onChange: (value: string) => void;
}) {
  const hint = spec.default !== undefined ? `default ${JSON.stringify(spec.default)}` : 'no default';
  let control;
  if (spec.kind === 'enum' || spec.kind === 'boolean') {
    const options = spec.kind === 'enum' ? spec.values.map((v) => [v, v] as const) : ([['true', 'yes (true)'], ['false', 'no (false)']] as const);
    control = (
      <select aria-label={`Parameter ${name}`} value={draft} onChange={(e) => onChange(e.currentTarget.value)}>
        <option value="">— {hint}</option>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    );
  } else {
    control = (
      <input
        aria-label={`Parameter ${name}`}
        type={spec.kind === 'number' ? 'number' : 'text'}
        step="any"
        value={draft}
        placeholder={hint}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
    );
  }
  return (
    <label className="sgl-typed">
      <span>
        <code>{name}</code>
      </span>
      {control}
    </label>
  );
}

function DiagnosticLines({ diagnostics }: { readonly diagnostics: readonly ExtensionDiagnostic[] }) {
  if (diagnostics.length === 0) return null;
  return (
    <ul className="sgl-checks">
      {diagnostics.map((d) => (
        <li key={d.id} className={`sgl-check-${d.severity}`}>
          ✖ {d.message}
        </li>
      ))}
    </ul>
  );
}

function RunResult({
  run,
  version,
  onApply,
  onDiscard,
  onSelect,
}: {
  readonly run: AlgorithmRun;
  readonly version: DocumentVersion | null;
  readonly onApply: (preview: TransformationPreview) => void;
  readonly onDiscard: () => void;
  readonly onSelect: SelectionHandler;
}) {
  const stale = isStale(run, version);
  const doc = version?.doc ?? null;
  const nodeButton = (id: string, enabled = true) =>
    enabled ? (
      <button type="button" className="sgl-link" onClick={() => onSelect(selectNode(id))}>
        {id}
      </button>
    ) : (
      <code>{id}</code>
    );

  if (!run.outcome.ok) {
    return (
      <section className="sgl-section algorithm-result" role="alert">
        <h4>“{run.label}” failed</h4>
        <DiagnosticLines diagnostics={run.outcome.issues} />
        <p className="sgl-help">The design was not changed.</p>
        <button type="button" onClick={onDiscard}>
          Dismiss
        </button>
      </section>
    );
  }

  const outcome = run.outcome.value;
  if (outcome.kind === 'analysis') {
    const rows = analysisRows(outcome.result.nodeValues, run.doc, doc);
    return (
      <section className="sgl-section algorithm-result">
        <h4>Analysis: {run.label}</h4>
        {outcome.result.summary && <p>{outcome.result.summary}</p>}
        {stale && <p className="sgl-warning">⚠ The design has changed since this ran; run it again for current values.</p>}
        <table className="algorithm-table">
          <thead>
            <tr>
              <th>Node</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.nodeId}>
                <td>{nodeButton(r.nodeId, r.exists)}</td>
                <td>{formatValue(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="sgl-help">Analyses never change the design.</p>
        <button type="button" onClick={onDiscard}>
          Close
        </button>
      </section>
    );
  }

  const { preview } = outcome;
  const summary = describePreview(preview);
  const empty = preview.operations.length === 0;
  return (
    <section className="sgl-section algorithm-result">
      <h4>Preview: {run.label}</h4>
      {preview.summary && <p>{preview.summary}</p>}
      {empty ? (
        <p className="meta">No changes to apply.</p>
      ) : (
        <>
          <p className="sgl-help">
            {preview.operations.length} operation(s), validated. Affected nodes:{' '}
            {summary.affectedNodeIds.map((id, i) => (
              <span key={id}>
                {i > 0 && ', '}
                {nodeButton(id, doc?.nodes.some((n) => n.id === id) ?? false)}
              </span>
            ))}
          </p>
          {summary.addedNodes.length > 0 && (
            <>
              <h4>New rooms</h4>
              <ul className="sgl-list">
                {summary.addedNodes.map((n) => (
                  <li key={n.id}>
                    <code>{n.id}</code> ({n.typeId}) at [{n.grid.join(', ')}]
                  </li>
                ))}
              </ul>
            </>
          )}
          {summary.addedEdges.length > 0 && (
            <>
              <h4>New connections</h4>
              <ul className="sgl-list">
                {summary.addedEdges.map((e) => (
                  <li key={e.id}>
                    <code>{e.id}</code>: {e.kind} between {e.source} and {e.target}
                  </li>
                ))}
              </ul>
            </>
          )}
          {summary.attributeChanges.length > 0 && (
            <>
              <h4>Changed attributes</h4>
              <ul className="sgl-list">
                {summary.attributeChanges.map((c) => (
                  <li key={`${c.nodeId}.${c.key}`}>
                    {nodeButton(c.nodeId)}.{c.key}: {formatValue(c.from)} → {formatValue(c.to)}
                  </li>
                ))}
              </ul>
            </>
          )}
          {preview.resolvedDiagnosticIds.length > 0 && (
            <p className="sgl-help">Resolves {preview.resolvedDiagnosticIds.length} existing check(s).</p>
          )}
        </>
      )}
      {stale && (
        <p className="sgl-error">
          The design has changed since this preview was computed, so it can no longer be applied. Run the algorithm again.
        </p>
      )}
      <div className="sgl-buttons">
        {!empty && (
          <button type="button" className="apply-button" disabled={stale} onClick={() => onApply(preview)}>
            Apply
          </button>
        )}
        <button type="button" onClick={onDiscard}>
          {empty ? 'Close' : 'Discard'}
        </button>
      </div>
    </section>
  );
}
