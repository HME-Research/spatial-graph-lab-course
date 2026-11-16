import { useState, type FormEvent } from 'react';
import type { DesignDocumentV2 } from '@app/document/v2';
import type { ActiveProject, AttributeSpec, ExtensionDiagnostic, TransformationPreviewV2 } from '@app/extensions';
import { ALGORITHM_GROUP_LABELS, EFFECT_LABELS, groupAlgorithms, presentAlgorithm } from '@app/ui';
import { HelpTip } from '@app/ui/help';
import { selectNode, type SelectionHandler } from '@core/viewer/selection';
import {
  analysisRows,
  describePreview,
  formatValue,
  isStale,
  listAlgorithms,
  parameterProblems,
  runEntryV2,
  type AlgorithmRunV2,
  type ApplyOutcome,
  type ParameterDrafts, type AttributesVersion, relationshipLabel } from './algorithmSession';
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
  shownAnalysis = null,
  onShowAnalysis,
  attributes,
}: {
  readonly project: ActiveProject | null;
  /** The current (schema-v2) document and its revision; results are bound to it. */
  readonly version: DocumentVersion<DesignDocumentV2> | null;
  /**
   * Apply a preview to the current design (atomic, stale-checked). `confirmed`: the user chose
   * "Move anyway and recalculate" for corridors displaced by new rooms.
   */
  readonly onApply: (preview: TransformationPreviewV2, ranAt: number, label: string, confirmed: boolean, attributesRevision?: number) => ApplyOutcome<DesignDocumentV2>;
  readonly onSelect: SelectionHandler;
  /** The analysis run currently shown on the model (owned by the shell), if any. */
  readonly shownAnalysis?: AlgorithmRunV2 | null;
  /** Show an analysis run's values on the model, or clear the overlay (null). */
  readonly onShowAnalysis?: (run: AlgorithmRunV2 | null) => void;
  /** The project attribute schema in use; a result is stale once it changes. */
  readonly attributes?: AttributesVersion;
}) {
  const algorithms = listAlgorithms(project);
  // Selected by file: ids may collide (duplicate definitions are listed separately, both disabled).
  const [selectedFile, setSelectedFile] = useState<string | null>(() => algorithms.find((a) => a.enabled)?.file ?? algorithms[0]?.file ?? null);
  const [drafts, setDrafts] = useState<Readonly<Record<string, ParameterDrafts>>>({});
  const [run, setRun] = useState<AlgorithmRunV2 | null>(null);
  const [notice, setNotice] = useState<{ readonly tone: 'ok' | 'error'; readonly text: string } | null>(null);

  const selectedIndex = algorithms.findIndex((a) => a.file === selectedFile);
  const selected = selectedIndex >= 0 ? algorithms[selectedIndex]! : null;
  const entryDrafts = (selected && drafts[selected.id]) ?? {};
  const problems = selected?.enabled ? parameterProblems(selected, entryDrafts) : [];
  // "Clear" on the result card (shell) clears the shown analysis; its value list goes with it, so
  // one result never appears twice (phase 08, O03).
  const [shownBefore, setShownBefore] = useState<AlgorithmRunV2 | null>(shownAnalysis);
  if (shownBefore !== shownAnalysis) {
    setShownBefore(shownAnalysis);
    if (shownAnalysis === null && run !== null && shownBefore === run) setRun(null);
  }

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
    const next = runEntryV2(version, project, selected, entryDrafts, attributes);
    setRun(next);
    // An analysis is shown on the model straight away (temporary colours; "Hide" / Clear remove them).
    if (next.outcome.ok && next.outcome.value.kind === 'analysis') onShowAnalysis?.(next);
    else if (shownAnalysis === run) onShowAnalysis?.(null);
  };

  const apply = (preview: TransformationPreviewV2, confirmed: boolean) => {
    if (!run) return;
    const outcome = onApply(preview, run.revision, run.label, confirmed, run.attributesRevision);
    if (outcome.ok) {
      setRun(null);
      setNotice({ tone: 'ok', text: `Applied “${run.label}”: ${preview.operations.length} operation(s). Undo reverts it in one step.` });
    } else setNotice({ tone: 'error', text: outcome.message });
  };

  return (
    <div className="algorithms sgl-inspector">
      {algorithms.length === 0 ? (
        <p className="meta">
          Project “{project.id}” has no algorithms. Add one in <code>projects/{project.id}/algorithms/</code>.
        </p>
      ) : (
        <div className="algorithm-list" aria-label="Algorithms" role="region">
          {groupAlgorithms(algorithms).map(({ group, items }) => (
            <section key={group} aria-labelledby={`algorithm-group-${group}`} className="sgl-algo-group" data-group={group}>
              <div className="sgl-algo-group-head">
                <h3 id={`algorithm-group-${group}`}>{ALGORITHM_GROUP_LABELS[group].label}</h3>
                <p>{ALGORITHM_GROUP_LABELS[group].description}</p>
              </div>
              <ul className="sgl-algo-items">
                {items.map(({ entry: a, index: i, presentation }) => (
                  <li key={a.file}>
                    <button
                      type="button"
                      aria-pressed={i === selectedIndex}
                      className={i === selectedIndex ? 'algorithm-item selected' : 'algorithm-item'}
                      title={EFFECT_LABELS[presentation.effect].description}
                      onClick={() => {
                        setSelectedFile(a.file);
                        setRun(null);
                        setNotice(null);
                      }}
                    >
                      <span className="algorithm-text">
                        <span className="algorithm-label">{a.label}</span>
                        <span className="algorithm-meta">
                          <span className="algorithm-term">{presentation.term}</span>
                          <span className={`algorithm-tag effect-${presentation.effect}`}>
                            {EFFECT_LABELS[presentation.effect].tag}
                            <span className="sgl-visually-hidden">{EFFECT_LABELS[presentation.effect].spoken}</span>
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {selected && (
        <form className="sgl-section" onSubmit={execute}>
          <p className="sgl-help">
            {EFFECT_LABELS[presentAlgorithm(selected).effect].description}{' '}
            <span className="algorithm-source" title={selected.file}>
              <code>{selected.id}</code>
            </span>
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
            <button type="submit" className="sgl-primary" disabled={!selected.enabled || problems.length > 0 || !version}>
              Run
            </button>
            {selected.scope === 'spatial' && selected.enabled && <span className="sgl-help">Shows a preview; nothing changes until you apply it.</span>}
          </div>
        </form>
      )}

      {notice && <p className={notice.tone === 'ok' ? 'algorithm-notice' : 'sgl-error'}>{notice.text}</p>}
      {run && (
        <RunResult
          run={run}
          version={version}
          {...(attributes && { attributesRevision: attributes.revision })}
          onApply={apply}
          onDiscard={() => {
            if (shownAnalysis === run) onShowAnalysis?.(null);
            setRun(null);
          }}
          onSelect={onSelect}
          shown={shownAnalysis === run}
          {...(onShowAnalysis && { onShow: (show: boolean) => onShowAnalysis(show ? run : null) })}
        />
      )}
    </div>
  );
}

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
  shown,
  onShow,
  attributesRevision,
}: {
  readonly attributesRevision?: number;
  readonly run: AlgorithmRunV2;
  readonly version: DocumentVersion<DesignDocumentV2> | null;
  readonly onApply: (preview: TransformationPreviewV2, confirmed: boolean) => void;
  readonly onDiscard: () => void;
  readonly onSelect: SelectionHandler;
  readonly shown: boolean;
  readonly onShow?: (show: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const stale = isStale(run, version, attributesRevision);
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
      <section className="sgl-section algorithm-result" aria-label={`Values of ${run.label}`}>
        <div className="algorithm-result-header">
          <h4>Values per room</h4> <HelpTip topicId="analysis-results" />
        </div>
        {!shown && outcome.result.summary && <p>{outcome.result.summary}</p>}
        {stale && (
          <div className="sgl-warning">
            ⚠ The design has changed since this ran; run it again for current values. <HelpTip topicId="stale-results" />
          </div>
        )}
        {onShow && !shown && (
          <div className="sgl-buttons">
            <button type="button" onClick={() => onShow(true)}>
              Show on the model
            </button>
          </div>
        )}
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
        <p className="sgl-help">Analyses never change the design. “Clear” above removes the colours and these values.</p>
        {!shown && (
          <button type="button" onClick={onDiscard}>
            Clear results
          </button>
        )}
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
          {summary.edgeAttributeChanges.length > 0 && (
            <>
              <h4>Changed connection attributes</h4>
              <ul className="sgl-list">
                {summary.edgeAttributeChanges.map((c) => (
                  <li key={`${c.edgeId}.${c.key}`}>
                    <code>{c.edgeId}</code>.{c.key}: {formatValue(c.from)} → {formatValue(c.to)}
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
      {!stale && !empty && preview.displacedRoutes.length > 0 && (
        <p className="sgl-warning" role="status">
          ⚠ New rooms would take the corridor cells of {preview.displacedRoutes.map((id) => relationshipLabel(preview.before, id)).join(', ')}. Applying keeps those relationships
          and recalculates their corridors; some may become Unresolved.
        </p>
      )}
      <div className="sgl-buttons">
        {!empty && !confirming && (
          <button
            type="button"
            className="apply-button sgl-primary"
            disabled={stale}
            onClick={() => (preview.displacedRoutes.length > 0 ? setConfirming(true) : onApply(preview, false))}
          >
            Apply
          </button>
        )}
        {!empty && confirming && (
          <>
            <button type="button" onClick={() => setConfirming(false)} autoFocus>
              Cancel
            </button>
            <button type="button" className="apply-button sgl-primary" disabled={stale} onClick={() => onApply(preview, true)}>
              Move anyway and recalculate
            </button>
          </>
        )}
        <button type="button" onClick={onDiscard}>
          {empty ? 'Close' : 'Discard'}
        </button>
      </div>
    </section>
  );
}
