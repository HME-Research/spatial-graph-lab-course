import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { DesignDocumentV2 } from '@app/document';
import { runUploadedToolkitTransform, runUploadedTransform, type ActiveToolkit, type ExtensionDiagnostic, type ParameterSpec, type StoredUpload, type TransformationPreviewV2 } from '@app/extensions';
import { ALGORITHM_TAB_LABELS, sourceTag, type AlgorithmSource } from '@app/ui/analysisSections';
import type { Explainer } from '@app/ui/guideContracts';
import { ExplainerWindow } from '@app/ui/guide';
import { SourceTag } from '@app/ui/SourceTag';
import { useFunctionName } from '@app/views/functionColour';
import '@app/analysis/analysis.css';
import { selectNode, type SelectionHandler } from '@core/viewer/selection';
import {
  describePreview,
  draftsToParameters,
  formatValue,
  isStale,
  listAlgorithms,
  parameterLabel,
  parameterProblems,
  runEntryV2,
  type AlgorithmEntry,
  type AlgorithmRunV2,
  type ApplyOutcome,
  type ParameterDrafts,
  type AttributesVersion,
  type HostResolution,
  relationshipLabel,
} from './algorithmSession';
import type { DocumentVersion } from './documentSession';
import { TRANSFORM_EXPLAINER, TRANSFORM_UPLOAD_BUTTON_LABEL, TRANSFORM_UPLOAD_NOTE, transformUploadExplainer } from './transformExplainers';
import { addTransformUpload, transformUploadEntries, useUploadedTransforms, yoursTransformKey, type UploadedTransformEntry } from './transformUploads';

const NO_UPLOADS: readonly StoredUpload[] = [];

/** One transform the panel lists: a toolkit transform or an uploaded one (Yours). */
interface TransformItem {
  /** `toolkit:<file>` or `yours:<upload id>` (ids may collide, keys never do). */
  readonly key: string;
  readonly entry: AlgorithmEntry;
  readonly upload?: UploadedTransformEntry;
}

export interface TransformPanelProps {
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
  /** Whether the project has a toolkit (absent: it has one if it has algorithms). */
  readonly hasToolkit?: boolean;
  /** The student's uploaded transforms (project `settings.uploadedTransforms`); absent: none. */
  readonly uploads?: readonly StoredUpload[];
  /** Store a new list of uploaded transforms (add, replace, remove); absent: uploading is not offered. */
  readonly onUploads?: (uploads: readonly StoredUpload[]) => void;
}

/**
 * The Transform tab (Programme P4; uploads 2026-11-25): at the top ONE "Upload your own (.ts)"
 * button with an ⓘ (what an uploaded transform is, then the transform AI kit tabs), then the tab's
 * summary with its own ⓘ (`TRANSFORM_EXPLAINER`), then "Yours" (uploaded transforms; a loading or
 * failed one is listed disabled with its reason; ↻ replaces, ✕ removes) and "Toolkit: <name>" with
 * the toolkit's spatial algorithms. (A Built-in section stays hidden while empty.) Choose one, set
 * its parameters, Run: a validated PREVIEW that changes the design only on an explicit Apply (one
 * undo step; refused if the design changed since the run); Discard drops it. An uploaded transform
 * runs in a worker (asynchronous, "Running…") and gives the same preview. Nothing runs automatically.
 */
export function TransformPanel({ project, version, onApply, onSelect, attributes, resolution, hasToolkit, uploads = NO_UPLOADS, onUploads }: TransformPanelProps) {
  // Only transformations (spatial algorithms, and broken definitions that may be one) belong here.
  const algorithms = listAlgorithms(project).filter((a) => a.scope !== 'graph' && a.scope !== 'design');
  const loaded = useUploadedTransforms(uploads);
  const yours = transformUploadEntries(loaded);
  const toolkitItems: TransformItem[] = algorithms.map((a) => ({ key: `toolkit:${a.file}`, entry: a }));
  const yourItems: TransformItem[] = yours.map((u) => ({ key: u.key, entry: u, upload: u }));
  const items = [...yourItems, ...toolkitItems];

  // Selected by key: ids may collide (duplicate definitions are listed separately, both disabled).
  const [selectedKey, setSelectedKey] = useState<string | null>(() => toolkitItems.find((a) => a.entry.enabled)?.key ?? toolkitItems[0]?.key ?? null);
  const [drafts, setDrafts] = useState<Readonly<Record<string, ParameterDrafts>>>({});
  const [run, setRun] = useState<AlgorithmRunV2 | null>(null);
  const [notice, setNotice] = useState<{ readonly tone: 'ok' | 'error'; readonly text: string } | null>(null);
  const [explainer, setExplainer] = useState<Explainer | null>(null);
  /** The uploaded transform whose worker is running (one at a time). */
  const [running, setRunning] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  /** Result of the last upload / replace: where to show it (`top`, or an item key) and what. */
  const [uploadNotice, setUploadNotice] = useState<{ readonly at: string; readonly ok: boolean; readonly lines: readonly string[] } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /** The upload a chosen file replaces (null: a new upload). */
  const replacing = useRef<string | null>(null);
  /** Grows with every run started and every change of selection: a reply for an older run is dropped. */
  const runToken = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The selected item, else the first enabled toolkit transform, else the first upload.
  const selected =
    items.find((i) => i.key === selectedKey) ?? toolkitItems.find((i) => i.entry.enabled) ?? toolkitItems[0] ?? yourItems.find((i) => i.entry.enabled) ?? null;
  const entryDrafts = (selected && drafts[selected.key]) ?? {};
  const problems = selected?.entry.enabled ? parameterProblems(selected.entry, entryDrafts) : [];
  const withToolkit = hasToolkit ?? (project !== null && project.algorithms.length > 0);
  const toolkitName = withToolkit ? (project?.definition.name ?? null) : null;
  const source: AlgorithmSource | null = toolkitName !== null ? { kind: 'toolkit', toolkitName } : null;

  const choose = (key: string) => {
    runToken.current++;
    setSelectedKey(key);
    setRun(null);
    setRunning(null);
    setNotice(null);
  };

  /** An uploaded transform runs in a worker: asynchronous, stopped after the timeout. */
  const runUpload = async (item: TransformItem, at: DocumentVersion<DesignDocumentV2>, registry: ActiveToolkit) => {
    const upload = loaded.find((u) => u.stored.id === item.upload?.uploadId);
    if (!upload || upload.status === 'loading' || !upload.status.ok) return;
    const token = ++runToken.current;
    const attributesRevision = attributes?.revision;
    const spatial = resolution && resolution.doc === at.doc ? resolution.spatial : undefined;
    setRun(null);
    setRunning(item.key);
    const outcome = await runUploadedTransform(upload.status, upload.stored.fileName, at.doc, registry, draftsToParameters(item.entry, entryDrafts), {
      ...(attributes && { attributes: attributes.schema }),
      ...(spatial && { spatial }),
    });
    if (!mounted.current || token !== runToken.current) return;
    setRunning(null);
    setRun({
      algorithmId: item.entry.id,
      label: item.entry.label,
      doc: at.doc,
      revision: at.revision,
      ...(attributesRevision !== undefined && { attributesRevision }),
      outcome,
    });
  };

  /** A transform of an UPLOADED toolkit (2026-11-26) runs in the upload worker, with the toolkit's modules. */
  const runToolkitUpload = async (item: TransformItem, at: DocumentVersion<DesignDocumentV2>, registry: ActiveToolkit) => {
    const token = ++runToken.current;
    const attributesRevision = attributes?.revision;
    const spatial = resolution && resolution.doc === at.doc ? resolution.spatial : undefined;
    setRun(null);
    setRunning(item.key);
    const outcome = await runUploadedToolkitTransform(at.doc, registry, item.entry.id, draftsToParameters(item.entry, entryDrafts), {
      ...(attributes && { attributes: attributes.schema }),
      ...(spatial && { spatial }),
    });
    if (!mounted.current || token !== runToken.current) return;
    setRunning(null);
    setRun({ algorithmId: item.entry.id, label: item.entry.label, doc: at.doc, revision: at.revision, ...(attributesRevision !== undefined && { attributesRevision }), outcome });
  };

  const execute = (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !selected.entry.enabled || !version || !project) return;
    setNotice(null);
    if (selected.upload) {
      void runUpload(selected, version, project);
      return;
    }
    if (project.uploaded) {
      void runToolkitUpload(selected, version, project);
      return;
    }
    runToken.current++;
    setRunning(null);
    setRun(runEntryV2(version, project, selected.entry, entryDrafts, attributes, resolution));
  };

  const apply = (preview: TransformationPreviewV2, confirmed: boolean) => {
    if (!run) return;
    const outcome = onApply(preview, run.revision, run.label, confirmed, run.attributesRevision);
    if (outcome.ok) {
      setRun(null);
      setNotice({ tone: 'ok', text: `Applied “${run.label}”: ${preview.operations.length} operation(s). Undo reverts it in one step.` });
    } else setNotice({ tone: 'error', text: outcome.message });
  };

  // ── Uploading (2026-11-25, as in Analyse) ──
  const chooseFile = (replaceId: string | null) => {
    replacing.current = replaceId;
    setUploadNotice(null);
    fileInput.current?.click();
  };

  const onFileChosen = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    const replaceId = replacing.current;
    replacing.current = null;
    input.value = '';
    if (!file || !onUploads) return;
    const at = replaceId === null ? 'top' : yoursTransformKey(replaceId);
    setUploading(true);
    const check = await addTransformUpload(file, loaded, replaceId);
    if (!mounted.current) return;
    setUploading(false);
    if (!check.ok) {
      setUploadNotice({ at, ok: false, lines: [`Could not ${replaceId === null ? 'add' : 'replace with'} ${file.name}:`, ...check.problems] });
      return;
    }
    const uploadId = replaceId ?? check.uploads.at(-1)?.id;
    onUploads(check.uploads);
    if (uploadId !== undefined) {
      const key = yoursTransformKey(uploadId);
      if (replaceId !== null) setDrafts((current) => ({ ...current, [key]: {} }));
      choose(key);
    }
    setUploadNotice({ at, ok: true, lines: [`${replaceId === null ? 'Added' : 'Replaced with'} “${check.definition.label}” (Yours).`] });
  };

  const removeUpload = (uploadId: string) => {
    if (!onUploads) return;
    const key = yoursTransformKey(uploadId);
    if (selected?.key === key) choose('');
    setConfirmRemove(null);
    setUploadNotice(null);
    onUploads(uploads.filter((u) => u.id !== uploadId));
  };

  const itemButton = (item: TransformItem) => {
    const { entry, upload } = item;
    const isSelected = item.key === selected?.key;
    return (
      <li key={item.key} data-transform={item.key}>
        <div className="sgl-transform-row">
          <button
            type="button"
            aria-pressed={isSelected}
            className={isSelected ? 'algorithm-item selected' : 'algorithm-item'}
            title={
              upload?.loading
                ? `Loading ${upload.fileName}…`
                : entry.enabled
                  ? 'Shows a preview; the design changes only when you Apply it (one undo step).'
                  : upload
                    ? entry.problems.join('\n')
                    : 'Its definition is invalid, so it cannot run.'
            }
            onClick={() => choose(item.key)}
          >
            <span className="algorithm-text">
              <span className="algorithm-label">{entry.label}</span>
              <span className="algorithm-meta">
                {upload ? <SourceTag text="Yours" title={`Uploaded from ${upload.fileName}`} /> : source && <SourceTag text={sourceTag(source)} />}
                {!entry.enabled && !upload?.loading && <span className="algorithm-tag effect-unavailable">Disabled</span>}
              </span>
            </span>
          </button>
          {upload && onUploads && (
            <>
              <button
                type="button"
                className="sgl-analyse-mini"
                aria-label={`Replace ${entry.label} with a new version`}
                title="Replace with a new version of the file (keeps its place)"
                disabled={uploading}
                onClick={() => chooseFile(upload.uploadId)}
              >
                ↻
              </button>
              <button
                type="button"
                className="sgl-analyse-mini"
                aria-label={`Remove ${entry.label}`}
                title="Remove this uploaded transform from the project"
                onClick={() => setConfirmRemove(upload.uploadId)}
              >
                ✕
              </button>
            </>
          )}
        </div>
        {upload?.loading && <p className="sgl-analyse-small">Loading {upload.fileName}…</p>}
        {upload && !entry.enabled && !upload.loading && <p className="sgl-error sgl-analyse-small">Disabled: {entry.problems[0] ?? 'invalid definition'}</p>}
        {upload && confirmRemove === upload.uploadId && (
          <div className="sgl-analyse-confirm" role="group" aria-label={`Remove ${entry.label}?`}>
            <span>Remove “{entry.label}” from this project? The file on your computer is not changed.</span>
            <div className="sgl-buttons">
              <button type="button" onClick={() => removeUpload(upload.uploadId)}>
                Remove
              </button>
              <button type="button" onClick={() => setConfirmRemove(null)}>
                Keep
              </button>
            </div>
          </div>
        )}
        {uploadNotice?.at === item.key && <UploadNotice notice={uploadNotice} />}
      </li>
    );
  };

  const isRunning = selected !== null && running === selected.key;

  return (
    <div className="algorithms transform-panel sgl-inspector">
      {onUploads && (
        <div className="sgl-analyse-upload" data-upload-block>
          <div className="sgl-analyse-upload-row">
            <button type="button" data-upload="new" disabled={uploading} onClick={() => chooseFile(null)}>
              {uploading ? 'Checking the file…' : TRANSFORM_UPLOAD_BUTTON_LABEL}
            </button>
            <button
              type="button"
              className="sgl-info-button"
              aria-label="About uploading your own transform"
              title="About uploading your own transform"
              aria-haspopup="dialog"
              data-upload-info-button
              onClick={() => setExplainer(transformUploadExplainer())}
            >
              ⓘ
            </button>
          </div>
          <p className="sgl-help sgl-analyse-upload-note">{TRANSFORM_UPLOAD_NOTE}</p>
          {uploadNotice?.at === 'top' && <UploadNotice notice={uploadNotice} />}
        </div>
      )}
      <p className="sgl-help sgl-tab-intro">
        {ALGORITHM_TAB_LABELS.transform.summary}{' '}
        <button type="button" className="sgl-info-button" aria-label="About Transform" title="About Transform" aria-haspopup="dialog" onClick={() => setExplainer(TRANSFORM_EXPLAINER)}>
          ⓘ
        </button>
      </p>

      {/* Built-in transformations: none yet, so the section is hidden (P4: hidden while empty). */}
      {yourItems.length > 0 && (
        <section aria-labelledby="transform-yours" className="sgl-algo-group" data-transform-section="yours">
          <div className="sgl-algo-group-head">
            <h3 id="transform-yours">Yours</h3>
          </div>
          <ul className="sgl-algo-items" aria-label="Your transformations">
            {yourItems.map(itemButton)}
          </ul>
        </section>
      )}
      {toolkitItems.length > 0 && (
        <section aria-labelledby="transform-toolkit" className="sgl-algo-group" data-transform-section="toolkit">
          <div className="sgl-algo-group-head">
            <h3 id="transform-toolkit">{source ? sourceTag(source) : 'Toolkit'}</h3>
          </div>
          <ul className="sgl-algo-items" aria-label="Transformations">
            {toolkitItems.map(itemButton)}
          </ul>
        </section>
      )}
      {toolkitItems.length === 0 && (
        <p className="meta" data-transform-empty="">
          {project && toolkitName
            ? <>Toolkit “{toolkitName}” has no transformations (add one in <code>toolkits/{project.id}/algorithms/</code> with <code>defineSpatialAlgorithm</code>).{yourItems.length === 0 && onUploads && <> Upload your own (.ts) above.</>}</>
            : yourItems.length > 0
              ? <>This project has no toolkit transformations.</>
              : onUploads
                ? <>No transformations yet. Upload your own (.ts) above, or use a toolkit with transformations (<code>toolkits/&lt;id&gt;/algorithms/</code>).</>
                : <>No transformations yet. Open a project to upload your own (.ts), or use a toolkit with transformations (<code>toolkits/&lt;id&gt;/algorithms/</code>).</>}
        </p>
      )}

      {selected && (
        <form className="sgl-section" onSubmit={execute}>
          <p className="sgl-help">
            Shows a preview; the design changes only when you Apply it (one undo step).{' '}
            <span className="algorithm-source" title={selected.upload ? `Uploaded from ${selected.upload.fileName}` : selected.entry.file}>
              <code>{selected.entry.id}</code>
            </span>
          </p>
          {!selected.entry.enabled && !selected.upload?.loading && (
            <div className="sgl-error">
              ✖ {selected.upload ? 'This uploaded transform cannot run:' : 'This algorithm is disabled because its definition is invalid:'}
              <ul className="sgl-list">
                {selected.entry.problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {selected.entry.parameters.length > 0 && <h4>Parameters</h4>}
          {selected.entry.parameters.map(([key, spec]) => (
            <ParameterField
              key={`${selected.key}:${key}`}
              name={key}
              spec={spec}
              draft={entryDrafts[key] ?? ''}
              onChange={(value) => setDrafts({ ...drafts, [selected.key]: { ...entryDrafts, [key]: value } })}
            />
          ))}
          <DiagnosticLines diagnostics={problems} />
          <div className="sgl-buttons">
            <button type="submit" className="sgl-primary" disabled={!selected.entry.enabled || problems.length > 0 || !version || !project || isRunning}>
              Run
            </button>
          </div>
          {isRunning && (
            <p className="sgl-analyse-small" role="status">
              Running…
            </p>
          )}
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
      {explainer && <ExplainerWindow explainer={explainer} open onClose={() => setExplainer(null)} />}
      {onUploads && (
        <input
          ref={fileInput}
          type="file"
          accept=".ts,.js"
          hidden
          data-upload-input
          aria-label="Upload a transform (.ts)"
          onChange={(event) => void onFileChosen(event)}
        />
      )}
    </div>
  );
}

/** What happened to the last upload / replacement. */
function UploadNotice({ notice }: { readonly notice: { readonly ok: boolean; readonly lines: readonly string[] } }) {
  return (
    <div className={notice.ok ? 'sgl-analyse-small sgl-analyse-upload-ok' : 'sgl-error sgl-analyse-small'} role={notice.ok ? 'status' : 'alert'} data-upload-notice={notice.ok ? 'ok' : 'error'}>
      {notice.lines.map((line, n) => (
        <div key={n}>{line}</div>
      ))}
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
  const functionName = useFunctionName();
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
              <h4>New nodes</h4>
              <ul className="sgl-list">
                {summary.addedNodes.map((n) => (
                  <li key={n.id}>
                    <code>{n.id}</code> ({functionName(n.function)}) at [{n.position.join(', ')}]
                  </li>
                ))}
              </ul>
            </>
          )}
          {summary.addedEdges.length > 0 && (
            <>
              <h4>New edges</h4>
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
              <h4>Moved or resized nodes</h4>
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
              <h4>Changed edge attributes</h4>
              <ul className="sgl-list">
                {summary.edgeAttributeChanges.map((c) => (
                  <li key={`${c.edgeId}.${c.key}`}>
                    <code>{c.edgeId}</code>.{c.key}: {formatValue(c.from)} → {formatValue(c.to)}
                  </li>
                ))}
              </ul>
            </>
          )}
          {summary.boundaryShiftChanges.length > 0 && (
            <>
              <h4>Requested boundary shifts</h4>
              <ul className="sgl-list">
                {summary.boundaryShiftChanges.map((c) => (
                  <li key={c.edgeId}>
                    <code>{c.edgeId}</code>: {c.from} → {c.to}
                  </li>
                ))}
              </ul>
              <p className="sgl-help">A request is kept even if it cannot be applied; after Apply, the edge’s Properties show whether it applies.</p>
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
          ⚠ New nodes would take the corridor cells of {preview.displacedRoutes.map((id) => relationshipLabel(preview.before, id)).join(', ')}. Applying keeps those edges
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
