import { useId, useState, type FormEvent } from 'react';
import type { DesignDocumentV2 } from '@app/document';
import type { ActiveToolkit, ExtensionDiagnostic, ParameterSpec, TransformationPreviewV2 } from '@app/extensions';
import { ALGORITHM_TAB_LABELS, sourceTag, type AlgorithmSource } from '@app/ui/analysisSections';
import { ExplainerWindow } from '@app/ui/guide';
import { SourceTag } from '@app/ui/SourceTag';
import { ANALYSE_VS_TRANSFORM } from '@app/analysis/explainers';
import '@app/analysis/analysis.css';
import { selectNode, type SelectionHandler } from '@core/viewer/selection';
import {
  describePreview,
  formatValue,
  isStale,
  listAlgorithms,
  parameterLabel,
  parameterProblems,
  runEntryV2,
  type AlgorithmRunV2,
  type ApplyOutcome,
  type ParameterDrafts,
  type AttributesVersion,
  type HostResolution,
  relationshipLabel,
} from './algorithmSession';
import type { DocumentVersion } from './documentSession';

/**
 * The Transform tab (Programme P4; formerly the transformation part of the Algorithms panel):
 * a Built-in section (hidden while empty; there are no built-in transformations yet), then
 * "Toolkit: <name>" with the toolkit's spatial algorithms. Choose one, set its parameters, Run:
 * a validated PREVIEW that changes the design only on an explicit Apply (one undo step; refused if
 * the design changed since the run); Discard drops it. Nothing runs automatically.
 */
export function TransformPanel({
  project,
  version,
  onApply,
  onSelect,
  attributes,
  resolution,
}: {
  readonly project: ActiveToolkit | null;
  /** The current (schema-v2) document and its revision; results are bound to it. */
  readonly version: DocumentVersion<DesignDocumentV2> | null;
  /**
   * Apply a preview to the current design (atomic, stale-checked). `confirmed`: the user chose
   * "Move anyway and recalculate" for corridors displaced by new rooms.
   */
  readonly onApply: (preview: TransformationPreviewV2, ranAt: number, label: string, confirmed: boolean, attributesRevision?: number) => ApplyOutcome<DesignDocumentV2>;
  readonly onSelect: SelectionHandler;
  /** The project attribute schema in use; a result is stale once it changes. */
  readonly attributes?: AttributesVersion;
  /** The design port's preference-aware resolution of the current document (`ctx.metrics` equals what the views show). */
  readonly resolution?: HostResolution;
}) {
  // Only transformations (spatial algorithms, and broken definitions that may be one) belong here.
  const algorithms = listAlgorithms(project).filter((a) => a.scope !== 'graph');
  // Selected by file: ids may collide (duplicate definitions are listed separately, both disabled).
  const [selectedFile, setSelectedFile] = useState<string | null>(() => algorithms.find((a) => a.enabled)?.file ?? algorithms[0]?.file ?? null);
  const [drafts, setDrafts] = useState<Readonly<Record<string, ParameterDrafts>>>({});
  const [run, setRun] = useState<AlgorithmRunV2 | null>(null);
  const [notice, setNotice] = useState<{ readonly tone: 'ok' | 'error'; readonly text: string } | null>(null);

  const selectedIndex = algorithms.findIndex((a) => a.file === selectedFile);
  const selected = selectedIndex >= 0 ? algorithms[selectedIndex]! : null;
  const entryDrafts = (selected && drafts[selected.id]) ?? {};
  const problems = selected?.enabled ? parameterProblems(selected, entryDrafts) : [];
  const [explainerOpen, setExplainerOpen] = useState(false);
  const toolkitName = project?.definition.name ?? null;
  const source: AlgorithmSource | null = toolkitName !== null ? { kind: 'toolkit', toolkitName } : null;

  const intro = (
    <p className="sgl-help sgl-tab-intro">
      {ALGORITHM_TAB_LABELS.transform.summary}{' '}
      <button type="button" className="sgl-info-button" aria-label="About Analyse vs Transform" title="Analyse vs Transform" onClick={() => setExplainerOpen(true)}>
        ⓘ
      </button>
      <ExplainerWindow explainer={ANALYSE_VS_TRANSFORM} open={explainerOpen} onClose={() => setExplainerOpen(false)} />
    </p>
  );

  if (!project || algorithms.length === 0) {
    return (
      <div className="algorithms transform-panel sgl-inspector">
        {intro}
        <p className="meta">
          {project && project.id !== '' && toolkitName
            ? <>Toolkit “{toolkitName}” has no transformations. Add one in <code>toolkits/{project.id}/algorithms/</code> with <code>defineSpatialAlgorithm</code>.</>
            : <>No transformations yet. They come from the project’s toolkit (<code>toolkits/&lt;id&gt;/algorithms/</code>).</>}
        </p>
      </div>
    );
  }

  const execute = (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !selected.enabled || !version) return;
    setNotice(null);
    setRun(runEntryV2(version, project, selected, entryDrafts, attributes, resolution));
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
    <div className="algorithms transform-panel sgl-inspector">
      {intro}
      {/* Built-in transformations: none yet, so the section is hidden (P4: hidden while empty). */}
      <section aria-labelledby="transform-toolkit" className="sgl-algo-group" data-transform-section="toolkit">
        <div className="sgl-algo-group-head">
          <h3 id="transform-toolkit">{source ? sourceTag(source) : 'Toolkit'}</h3>
        </div>
        <ul className="sgl-algo-items" aria-label="Transformations">
          {algorithms.map((a, i) => (
            <li key={a.file}>
              <button
                type="button"
                aria-pressed={i === selectedIndex}
                className={i === selectedIndex ? 'algorithm-item selected' : 'algorithm-item'}
                title={a.enabled ? 'Shows a preview; the design changes only when you Apply it (one undo step).' : 'Its definition is invalid, so it cannot run.'}
                onClick={() => {
                  setSelectedFile(a.file);
                  setRun(null);
                  setNotice(null);
                }}
              >
                <span className="algorithm-text">
                  <span className="algorithm-label">{a.label}</span>
                  <span className="algorithm-meta">
                    {source && <SourceTag text={sourceTag(source)} />}
                    {!a.enabled && <span className="algorithm-tag effect-unavailable">Disabled</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selected && (
        <form className="sgl-section" onSubmit={execute}>
          <p className="sgl-help">
            Shows a preview; the design changes only when you Apply it (one undo step).{' '}
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
          onDiscard={() => setRun(null)}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}

/** One parameter: its label (else the key), its description under it, and a control by kind. */
export function ParameterField({
  name,
  spec,
  draft,
  onChange,
}: {
  readonly name: string;
  readonly spec: ParameterSpec;
  readonly draft: string;
  readonly onChange: (value: string) => void;
}) {
  const descriptionId = useId();
  const shown = parameterLabel(name, spec);
  const described = shown.description !== null ? { 'aria-describedby': descriptionId } : {};
  const hint = spec.default !== undefined ? `default ${JSON.stringify(spec.default)}` : 'no default';
  let control;
  if (spec.kind === 'enum' || spec.kind === 'boolean') {
    const options = spec.kind === 'enum' ? spec.values.map((v) => [v, v] as const) : ([['true', 'yes (true)'], ['false', 'no (false)']] as const);
    control = (
      <select aria-label={`Parameter ${name}`} {...described} value={draft} onChange={(e) => onChange(e.currentTarget.value)}>
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
        {...described}
        type={spec.kind === 'number' ? 'number' : 'text'}
        step="any"
        value={draft}
        placeholder={hint}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
    );
  }
  return (
    <label className="sgl-typed" data-parameter={name}>
      <span className="sgl-parameter-label">{shown.isKey ? <code>{name}</code> : shown.label}</span>
      {control}
      {shown.description !== null && (
        <span id={descriptionId} className="sgl-help sgl-parameter-description">
          {shown.description}
        </span>
      )}
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
  attributesRevision,
}: {
  readonly attributesRevision?: number;
  readonly run: AlgorithmRunV2;
  readonly version: DocumentVersion<DesignDocumentV2> | null;
  readonly onApply: (preview: TransformationPreviewV2, confirmed: boolean) => void;
  readonly onDiscard: () => void;
  readonly onSelect: SelectionHandler;
}) {
  const [confirming, setConfirming] = useState(false);
  const stale = isStale(run, version, attributesRevision);
  const doc = version?.doc ?? null;
  const nodeButton = (id: number, enabled = true) =>
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
  if (outcome.kind !== 'transformation') return null;
  const { preview } = outcome;
  const summary = describePreview(preview);
  const empty = preview.operations.length === 0;
  return (
    <section className="sgl-section algorithm-result">
      <h4>Preview: {run.label}</h4>
      {preview.summary && <p style={{ whiteSpace: 'pre-line' }}>{preview.summary}</p>}
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
                    <code>{n.id}</code> ({n.function}) at [{n.position.join(', ')}]
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
                    <code>{e.id}</code>: {e.relationship} between {e.source} and {e.target}
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
          {summary.geometryChanges.length > 0 && (
            <>
              <h4>Moved or resized rooms</h4>
              <ul className="sgl-list">
                {summary.geometryChanges.map((c) => (
                  <li key={c.nodeId}>
                    {nodeButton(c.nodeId)}: {c.from.size.join('×')} at [{c.from.position.join(', ')}] → {c.to.size.join('×')} at [{c.to.position.join(', ')}]
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
