import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { DesignDocumentV2 } from '@app/document';
import { runUploadedAnalysis, type ActiveToolkit, type StoredUpload } from '@app/extensions';
import { isStale, listAlgorithms, runEntryV2, type AttributesVersion, type HostResolution } from '@app/session/algorithmSession';
import type { DocumentVersion } from '@app/session/documentSession';
import { CollapsibleSection } from '@app/ui';
import { SourceTag } from '@app/ui/SourceTag';
import { ALGORITHM_TAB_LABELS, ANALYSE_SECTION_IDS, ANALYSE_SECTIONS, analyseSectionFor, sourceTag, type AnalyseSectionId } from '@app/ui/analysisSections';
import type { Explainer } from '@app/ui/guideContracts';
import { ExplainerWindow } from '@app/ui/guide';
import { sameSelection, type Selection } from '@core/viewer/selection';
import {
  allPicked,
  analysisItems,
  applyPick,
  catalogueFor,
  currentPrompt,
  hasNumberInput,
  itemsBySection,
  pickedInputs,
  pickSummary,
  selectionInputs,
  setAnalysisShown,
  setPickNumber,
  SOURCE_FILTER_LABELS,
  SOURCE_FILTERS,
  startPick,
  type AnalysisItem,
  type PickState,
  type SourceFilter,
  yoursKey,
} from './analyseModel';
import { analysisResultAnswer, runBuiltInAnalysis, type AnalysisAnswer, type AnalysisOutcome } from './builtIns';
import { ANALYSE_VS_TRANSFORM, analysisExplainer, sectionExplainer, uploadedExplainer } from './explainers';
import { addUpload, uploadEntries, useUploadedAnalyses } from './uploads';
import './analysis.css';

const NO_UPLOADS: readonly StoredUpload[] = [];

/**
 * The analysis result shown in the panel and on the model (owned by the shell, never part of the
 * document). Bound to the document version it ran on, so it is marked stale after any edit.
 */
export interface ShownAnalysis {
  /** The item that produced it (`built-in:degree`, `toolkit:<id>`). */
  readonly key: string;
  readonly title: string;
  readonly answer: AnalysisAnswer;
  /** The exact document and revision it ran on (see `isStale`). */
  readonly doc: DesignDocumentV2;
  readonly revision: number;
  readonly attributesRevision?: number;
}

export interface AnalysePanelProps {
  /** The active registry (toolkit analyses), or null. */
  readonly project: ActiveToolkit | null;
  readonly version: DocumentVersion<DesignDocumentV2> | null;
  /** The shared selection: Node / Edge analyses run on it; Queries are picked through it. */
  readonly selection: Selection;
  readonly shown: ShownAnalysis | null;
  readonly onShow: (shown: ShownAnalysis | null) => void;
  /** The built-ins listed (project `settings.analyses`, sanitised). */
  readonly shownBuiltIns: readonly string[];
  /** Change the listed built-ins (the "+" catalogue); absent: no "+". */
  readonly onShownBuiltIns?: (ids: readonly string[]) => void;
  /** The student's uploaded analyses (project `settings.uploadedAnalyses`); absent: none. */
  readonly uploads?: readonly StoredUpload[];
  /** Store a new list of uploads (add, replace, remove); absent: uploading is not offered. */
  readonly onUploads?: (uploads: readonly StoredUpload[]) => void;
  readonly attributes?: AttributesVersion;
  readonly resolution?: HostResolution;
}

/**
 * The Analyse tab (Programme P4): sections Node · Edge (open) · Network · Queries (collapsed), each
 * with an ⓘ explainer and a "+" catalogue of the remaining built-ins. Node / Edge analyses run on
 * the current selection; Queries collect their inputs one at a time — the current selection fills
 * the first matching input, and selecting in ANY view fills the next one (pick mode goes through the
 * shared selection, so views know nothing about analyses); Esc cancels. One result at a time: a
 * big answer, a short label and at most one small line; its nodes and edges are highlighted in
 * every view. Analyses never change the design.
 */
export function AnalysePanel({
  project,
  version,
  selection,
  shown,
  onShow,
  shownBuiltIns,
  onShownBuiltIns,
  uploads = NO_UPLOADS,
  onUploads,
  attributes,
  resolution,
}: AnalysePanelProps) {
  const [filter, setFilter] = useState<SourceFilter>('all');
  const [pick, setPick] = useState<PickState | null>(null);
  const [failure, setFailure] = useState<{ readonly key: string; readonly messages: readonly string[] } | null>(null);
  const [catalogue, setCatalogue] = useState<AnalyseSectionId | null>(null);
  const [explainer, setExplainer] = useState<Explainer | null>(null);
  /** The uploaded analysis whose worker is running (one at a time). */
  const [running, setRunning] = useState<string | null>(null);
  /** Result of the last upload / replace: where to show it (`catalogue` or an item key) and what. */
  const [uploadNotice, setUploadNotice] = useState<{ readonly at: string; readonly ok: boolean; readonly lines: readonly string[] } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /** The upload a chosen file replaces (null: a new upload). */
  const replacing = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loaded = useUploadedAnalyses(uploads);
  const toolkitName = project && project.algorithms.length > 0 ? project.definition.name : null;
  const entries = useMemo(() => listAlgorithms(project).filter((a) => a.scope === 'graph'), [project]);
  const items = analysisItems(
    shownBuiltIns,
    toolkitName !== null ? { name: toolkitName, analyses: entries.map((e) => ({ id: e.id, label: e.label, inputs: e.inputs, enabled: e.enabled, problems: e.problems })) } : null,
    uploadEntries(loaded),
  );
  const bySection = itemsBySection(items, filter);
  const loadedUpload = (item: AnalysisItem) => (item.source.kind === 'yours' ? loaded.find((u) => u.stored.id === item.id) : undefined);

  /** Show an outcome bound to the document version (and attribute revision) it ran on. */
  const finish = (item: AnalysisItem, outcome: AnalysisOutcome, at: DocumentVersion<DesignDocumentV2>, attributesRevision: number | undefined) => {
    if (outcome.ok) {
      setFailure(null);
      onShow({
        key: item.key,
        title: item.name,
        answer: outcome.answer,
        doc: at.doc,
        revision: at.revision,
        ...(attributesRevision !== undefined && { attributesRevision }),
      });
    } else {
      onShow(null);
      setFailure({ key: item.key, messages: outcome.messages });
    }
  };

  /** An uploaded analysis runs in a worker: asynchronous, stopped after the timeout. */
  const runUpload = async (item: AnalysisItem, inputs: readonly number[], at: DocumentVersion<DesignDocumentV2>) => {
    const upload = loadedUpload(item);
    if (!upload || upload.status === 'loading' || !upload.status.ok) return;
    const attributesRevision = attributes?.revision;
    setRunning(item.key);
    setFailure(null);
    const result = await runUploadedAnalysis(upload.status, upload.stored.fileName, at.doc, inputs);
    if (!mounted.current) return;
    setRunning((current) => (current === item.key ? null : current));
    finish(item, result.ok ? { ok: true, answer: analysisResultAnswer(item.name, result.result) } : { ok: false, messages: result.messages }, at, attributesRevision);
  };

  const run = (item: AnalysisItem, inputs: readonly number[]) => {
    if (!version) return;
    setPick(null);
    if (item.source.kind === 'yours') {
      void runUpload(item, inputs, version);
      return;
    }
    let outcome: AnalysisOutcome;
    if (item.source.kind === 'built-in') outcome = runBuiltInAnalysis(item.id, version.doc, inputs);
    else {
      const entry = entries.find((e) => e.id === item.id);
      if (!project || !entry) return;
      const result = runEntryV2(version, project, entry, {}, attributes, resolution, inputs).outcome;
      outcome = !result.ok
        ? { ok: false, messages: result.issues.map((d) => d.message) }
        : result.value.kind === 'analysis'
          ? { ok: true, answer: analysisResultAnswer(item.name, result.value.result) }
          : { ok: false, messages: ['This algorithm returned a transformation; it belongs in Transform.'] };
    }
    finish(item, outcome, version, attributes?.revision);
  };

  // ── Uploading (P4 item I) ──
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
    const at = replaceId === null ? 'catalogue' : yoursKey(replaceId);
    setUploading(true);
    const check = await addUpload(file, loaded, replaceId);
    if (!mounted.current) return;
    setUploading(false);
    if (!check.ok) {
      setUploadNotice({ at, ok: false, lines: [`Could not ${replaceId === null ? 'add' : 'replace with'} ${file.name}:`, ...check.problems] });
      return;
    }
    if (replaceId !== null && shown?.key === yoursKey(replaceId)) onShow(null);
    if (replaceId !== null && failure?.key === yoursKey(replaceId)) setFailure(null);
    onUploads(check.uploads);
    const section = ANALYSE_SECTIONS[analyseSectionFor(check.definition.inputs)].title;
    setUploadNotice({ at, ok: true, lines: [`${replaceId === null ? 'Added' : 'Replaced with'} “${check.definition.label}” (Yours) in ${section}.`] });
  };

  const removeUpload = (uploadId: string) => {
    if (!onUploads) return;
    const key = yoursKey(uploadId);
    if (shown?.key === key) onShow(null);
    if (failure?.key === key) setFailure(null);
    if (pick?.itemKey === key) setPick(null);
    setConfirmRemove(null);
    setUploadNotice(null);
    onUploads(uploads.filter((u) => u.id !== uploadId));
  };

  const findItem = (key: string) => items.find((i) => i.key === key);

  /** Run a query when every node / edge input is picked and it has no number to confirm. */
  const runIfReady = (state: PickState) => {
    const item = findItem(state.itemKey);
    if (!item || !allPicked(state) || hasNumberInput(state)) return false;
    const picked = pickedInputs(state);
    if (!('inputs' in picked)) return false;
    run(item, picked.inputs);
    return true;
  };

  // Pick mode: a NEW selection in any view fills the next input of the pending query.
  const lastSelection = useRef(selection);
  useEffect(() => {
    const before = lastSelection.current;
    lastSelection.current = selection;
    if (!pick || selection.kind === 'none' || sameSelection(before, selection)) return;
    const next = applyPick(pick, selection);
    if (!runIfReady(next)) setPick(next);
    // Only a selection change is a pick; `pick` itself is read from this render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  // Esc cancels picking (anywhere in the app).
  useEffect(() => {
    if (!pick) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPick(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pick]);

  const activate = (item: AnalysisItem) => {
    setFailure(null);
    if (item.section === 'queries') {
      const state = startPick(item, selection);
      if (!runIfReady(state)) setPick(state);
      return;
    }
    const inputs = selectionInputs(item, selection);
    if ('inputs' in inputs) run(item, inputs.inputs);
  };

  const stale = shown ? isStale(shown, version, attributes?.revision) : false;

  return (
    <div className="sgl-analyse">
      <p className="sgl-help sgl-tab-intro">
        {ALGORITHM_TAB_LABELS.analyse.summary} <InfoButton label="Analyse vs Transform" onClick={() => setExplainer(ANALYSE_VS_TRANSFORM)} />
      </p>
      <div className="sgl-analyse-filter" role="group" aria-label="Show analyses from">
        <span className="sgl-analyse-filter-label">Show:</span>
        {SOURCE_FILTERS.map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {SOURCE_FILTER_LABELS[f]}
          </button>
        ))}
      </div>
      {!version && <p className="meta">Open a project to analyse its graph.</p>}

      {ANALYSE_SECTION_IDS.map((section) => {
        const meta = ANALYSE_SECTIONS[section];
        const list = bySection[section];
        const hint = section === 'node' || section === 'edge' ? selectionInputs({ inputs: [], section }, selection) : null;
        const sectionInfo = sectionExplainer(section);
        return (
          <CollapsibleSection
            key={section}
            sectionId={`analyse-${section}`}
            className="sgl-analyse-section"
            title={meta.title}
            meta={meta.subtitle}
            defaultOpen={meta.openByDefault}
            actions={
              <>
                {sectionInfo && <InfoButton label={`${meta.title} section`} onClick={() => setExplainer(sectionInfo)} />}
                {onShownBuiltIns && (
                  <button
                    type="button"
                    className="sgl-analyse-add"
                    aria-expanded={catalogue === section}
                    aria-label={`Add or remove ${meta.title} analyses`}
                    title="Add or remove built-in analyses"
                    onClick={() => setCatalogue(catalogue === section ? null : section)}
                  >
                    +
                  </button>
                )}
              </>
            }
          >
            {catalogue === section && onShownBuiltIns && (
              <div className="sgl-analyse-catalogue" role="group" aria-label={`Built-in ${meta.title} analyses`}>
                {catalogueFor(section, shownBuiltIns).map((c) => (
                  <label key={c.id}>
                    <input type="checkbox" checked={c.shown} onChange={(e) => onShownBuiltIns(setAnalysisShown(shownBuiltIns, c.id, e.currentTarget.checked))} /> {c.name}
                  </label>
                ))}
                {onUploads && (
                  <div className="sgl-analyse-upload">
                    <button
                      type="button"
                      data-upload="new"
                      disabled={uploading}
                      title="Add your own graph analysis: one .ts file written with defineGraphAlgorithm (template in Guide › Toolkits & JSON)"
                      onClick={() => chooseFile(null)}
                    >
                      {uploading ? 'Checking the file…' : 'Upload your own (.ts)…'}
                    </button>
                    {uploadNotice?.at === 'catalogue' && <UploadNotice notice={uploadNotice} />}
                  </div>
                )}
                <button type="button" onClick={() => setCatalogue(null)}>
                  Done
                </button>
              </div>
            )}
            {hint && 'hint' in hint && list.length > 0 && <p className="sgl-help sgl-analyse-hint">{hint.hint}</p>}
            {list.length === 0 ? (
              <p className="meta">{filter === 'all' ? 'No analyses here. Use + to add one.' : 'None from this source.'}</p>
            ) : (
              <ul className="sgl-analyse-items">
                {list.map((item) => {
                  const ready = item.section === 'queries' || item.section === 'network' || (hint !== null && 'inputs' in hint);
                  const upload = loadedUpload(item);
                  const uploadReady = upload && upload.status !== 'loading' && upload.status.ok ? upload.status : undefined;
                  const info =
                    item.source.kind === 'built-in'
                      ? analysisExplainer(item.id)
                      : upload && uploadReady
                        ? uploadedExplainer({ uploadId: upload.stored.id, fileName: upload.stored.fileName, definition: uploadReady.definition })
                        : undefined;
                  const picking = pick?.itemKey === item.key ? pick : null;
                  const isRunning = running === item.key;
                  const loading = upload?.status === 'loading';
                  return (
                    <li key={item.key} className="sgl-analyse-item" data-analysis={item.key}>
                      <div className="sgl-analyse-row">
                        <button
                          type="button"
                          className={shown?.key === item.key || picking || isRunning ? 'sgl-analyse-run active' : 'sgl-analyse-run'}
                          disabled={!version || !item.enabled || !ready || isRunning}
                          title={!item.enabled ? item.problems.join('\n') : item.section === 'queries' ? 'Pick the inputs, then see the answer' : 'Run'}
                          onClick={() => activate(item)}
                        >
                          {item.name}
                        </button>
                        <SourceTag text={sourceTag(item.source)} {...(upload && { title: `Uploaded from ${upload.stored.fileName}` })} />
                        {info && <InfoButton label={item.name} onClick={() => setExplainer(info)} />}
                        {upload && onUploads && (
                          <>
                            <button
                              type="button"
                              className="sgl-analyse-mini"
                              aria-label={`Replace ${item.name} with a new version`}
                              title="Replace with a new version of the file (keeps its place)"
                              disabled={uploading}
                              onClick={() => chooseFile(upload.stored.id)}
                            >
                              ↻
                            </button>
                            <button
                              type="button"
                              className="sgl-analyse-mini"
                              aria-label={`Remove ${item.name}`}
                              title="Remove this uploaded analysis from the project"
                              onClick={() => setConfirmRemove(upload.stored.id)}
                            >
                              ✕
                            </button>
                          </>
                        )}
                      </div>
                      {loading && <p className="sgl-analyse-small">Loading {upload.stored.fileName}…</p>}
                      {!item.enabled && !loading && <p className="sgl-error sgl-analyse-small">Disabled: {item.problems[0] ?? 'invalid definition'}</p>}
                      {isRunning && (
                        <p className="sgl-analyse-small" role="status">
                          Running…
                        </p>
                      )}
                      {upload && confirmRemove === upload.stored.id && (
                        <div className="sgl-analyse-confirm" role="group" aria-label={`Remove ${item.name}?`}>
                          <span>Remove “{item.name}” from this project? The file on your computer is not changed.</span>
                          <div className="sgl-buttons">
                            <button type="button" onClick={() => removeUpload(upload.stored.id)}>
                              Remove
                            </button>
                            <button type="button" onClick={() => setConfirmRemove(null)}>
                              Keep
                            </button>
                          </div>
                        </div>
                      )}
                      {uploadNotice?.at === item.key && <UploadNotice notice={uploadNotice} />}
                      {picking && (
                        <PickPrompt
                          state={picking}
                          onNumber={(index, value) => setPick(setPickNumber(picking, index, value))}
                          onRun={() => {
                            const picked = pickedInputs(picking);
                            if ('inputs' in picked) run(item, picked.inputs);
                            else setPick({ ...picking, message: picked.problem });
                          }}
                          onCancel={() => setPick(null)}
                        />
                      )}
                      {shown?.key === item.key && (
                        <ResultCard shown={shown} stale={stale} onAgain={() => activate(item)} onClear={() => onShow(null)} />
                      )}
                      {failure?.key === item.key && (
                        <div className="sgl-analysis-result failed" role="alert">
                          <div className="sgl-analysis-label">Could not run {item.name}</div>
                          <ul className="sgl-analyse-small">
                            {failure.messages.slice(0, 3).map((m, n) => (
                              <li key={n}>{m}</li>
                            ))}
                          </ul>
                          <button type="button" onClick={() => setFailure(null)}>
                            Dismiss
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CollapsibleSection>
        );
      })}
      {explainer && <ExplainerWindow explainer={explainer} open onClose={() => setExplainer(null)} />}
      {onUploads && (
        <input
          ref={fileInput}
          type="file"
          accept=".ts,.js"
          hidden
          data-upload-input
          aria-label="Upload an analysis (.ts)"
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

function InfoButton({ label, onClick }: { readonly label: string; readonly onClick: () => void }) {
  return (
    <button type="button" className="sgl-info-button" aria-label={`About ${label}`} title={`About ${label}`} onClick={onClick}>
      ⓘ
    </button>
  );
}

/** The pending query: what to pick next (or the number to type), what is picked, Run / Cancel. */
function PickPrompt({
  state,
  onNumber,
  onRun,
  onCancel,
}: {
  readonly state: PickState;
  readonly onNumber: (index: number, value: number) => void;
  readonly onRun: () => void;
  readonly onCancel: () => void;
}) {
  const prompt = currentPrompt(state);
  const picking = prompt !== null && prompt.kind !== 'number';
  return (
    <div className="sgl-analyse-pick" role="status" aria-live="polite">
      {picking ? <div className="sgl-analyse-pick-text">{prompt.text}</div> : <div className="sgl-analyse-pick-text">Check the number, then Run.</div>}
      <div className="sgl-analyse-small">{pickSummary(state)}</div>
      {state.inputs.map((input, index) =>
        input.kind === 'number' ? (
          <label key={index} className="sgl-analyse-number">
            <span>{input.label}</span>
            <input
              type="number"
              step={1}
              {...(input.min !== undefined && { min: input.min })}
              {...(input.max !== undefined && { max: input.max })}
              value={state.values[index] ?? ''}
              onChange={(e) => onNumber(index, e.currentTarget.value === '' ? Number.NaN : Number(e.currentTarget.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onRun();
              }}
            />
          </label>
        ) : null,
      )}
      {state.message && <div className="sgl-error sgl-analyse-small">{state.message}</div>}
      <div className="sgl-buttons">
        {hasNumberInput(state) && (
          <button type="button" className="sgl-primary" disabled={!allPicked(state)} onClick={onRun}>
            Run
          </button>
        )}
        <button type="button" onClick={onCancel}>
          Cancel (Esc)
        </button>
      </div>
    </div>
  );
}

/** Answer first: a big answer, a short label, at most one small line; stale marking; Run again / Clear. */
function ResultCard({ shown, stale, onAgain, onClear }: { readonly shown: ShownAnalysis; readonly stale: boolean; readonly onAgain: () => void; readonly onClear: () => void }) {
  const { answer } = shown;
  return (
    <div className={stale ? 'sgl-analysis-result stale' : 'sgl-analysis-result'} role="status" aria-label={`Result of ${shown.title}`}>
      <div className="sgl-analysis-answer">{answer.answer}</div>
      <div className="sgl-analysis-label">{answer.label}</div>
      {stale ? (
        <div className="sgl-analysis-detail sgl-analysis-stale">⚠ Out of date: the design changed. Run it again.</div>
      ) : (
        answer.detail && <div className="sgl-analysis-detail">{answer.detail}</div>
      )}
      <div className="sgl-buttons">
        <button type="button" onClick={onAgain}>
          Run again
        </button>
        <button type="button" onClick={onClear} title="Remove the answer and the highlights">
          Clear
        </button>
      </div>
    </div>
  );
}
