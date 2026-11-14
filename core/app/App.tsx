import { useCallback, useRef, useState, type ChangeEvent } from 'react';
import exampleDesign from '../../student/designs/two-storey-example.json';
import {
  applyGraphCommand,
  formatIssuePath,
  isVerticalKind,
  parseDesignJson,
  serializeDesign,
  validateDocument,
  type DesignDocument,
  type GraphIssue,
  type Result,
} from '@app/document';
import type { GraphCommandHandler } from '../viewer/contracts';
import { NO_SELECTION, reconcileSelection, type Selection } from '../viewer/selection';
import { Workspace } from './Workspace';

const EXAMPLE_LABEL = 'student/designs/two-storey-example.json';

interface Loaded {
  readonly doc: DesignDocument;
  readonly source: string;
}

interface LoadFailure {
  readonly source: string;
  readonly issues: readonly GraphIssue[];
}

interface State {
  readonly current: Loaded | null;
  readonly failure: LoadFailure | null;
}

/** Validated results only ever replace the current document; failures leave it untouched. */
function applyResult(prev: State, result: Result<DesignDocument>, source: string): State {
  return result.ok
    ? { current: { doc: result.value, source }, failure: null }
    : { current: prev.current, failure: { source, issues: result.issues } };
}

const loadExample = (prev: State): State => applyResult(prev, validateDocument(exampleDesign), EXAMPLE_LABEL);

const fmtGrid = (g: readonly number[]) => `[${g.join(', ')}]`;

/** File name for an exported design, derived from its metadata name. */
const exportFileName = (doc: DesignDocument): string =>
  `${doc.metadata.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'design'}.json`;

/** Download the current document as canonical JSON (the same text `parseDesignJson` accepts). */
function downloadDesign(doc: DesignDocument): void {
  const url = URL.createObjectURL(new Blob([serializeDesign(doc)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = exportFileName(doc);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function App() {
  const [state, setStateRaw] = useState<State>(() => loadExample({ current: null, failure: null }));
  const [rawSelection, setSelection] = useState<Selection>(NO_SELECTION);
  // Mirror of the latest state so command handlers can validate synchronously against it.
  const stateRef = useRef(state);
  const setState = useCallback((update: (prev: State) => State) => {
    const next = update(stateRef.current);
    stateRef.current = next;
    setStateRaw(next);
    return next;
  }, []);

  const { current, failure } = state;
  const selection = current ? reconcileSelection(rawSelection, current.doc) : NO_SELECTION;

  /** Loading a document replaces it wholesale; the selection is cleared only when it succeeds. */
  const load = (update: (prev: State) => State) => {
    const before = stateRef.current.current;
    if (setState(update).current !== before) setSelection(NO_SELECTION);
  };

  const onCommand = useCallback<GraphCommandHandler>(
    (command) => {
      const doc = stateRef.current.current?.doc;
      if (!doc) return { ok: false, issues: [{ path: [], code: 'not-found', message: 'no design is loaded' }] };
      const result = applyGraphCommand(doc, command);
      if (!result.ok) return { ok: false, issues: result.issues };
      setState((prev) => ({ ...prev, current: prev.current && { ...prev.current, doc: result.value } }));
      return { ok: true };
    },
    [setState],
  );

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const text = await file.text();
    load((prev) => applyResult(prev, parseDesignJson(text), file.name));
  }

  return (
    <div className="app">
      <header className="toolbar">
        <h1>Spatial Graph Lab</h1>
        <div className="actions">
          <button type="button" onClick={() => load(loadExample)}>
            Load example
          </button>
          <label className="file-button">
            Open JSON…
            <input type="file" accept=".json,application/json" onChange={onFile} />
          </label>
          <button type="button" disabled={!current} onClick={() => current && downloadDesign(current.doc)}>
            Export JSON
          </button>
        </div>
      </header>

      <main>
        {failure && (
          <section className="issues" role="alert">
            <h2>
              Could not load <code>{failure.source}</code>
            </h2>
            <p>{current ? 'The current design was kept unchanged.' : 'No design is loaded.'}</p>
            <ul>
              {failure.issues.map((i, n) => (
                <li key={n}>
                  <code>{formatIssuePath(i.path)}</code> — {i.message} <span className="code">({i.code})</span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setState((s) => ({ ...s, failure: null }))}>
              Dismiss
            </button>
          </section>
        )}

        {current && (
          <Workspace doc={current.doc} selection={selection} onSelect={setSelection} onCommand={onCommand} />
        )}

        {current && (
          <details className="document-data">
            <summary>Document data</summary>
            <DesignSummary loaded={current} />
          </details>
        )}
      </main>
    </div>
  );
}

function DesignSummary({ loaded }: { loaded: Loaded }) {
  const { doc, source } = loaded;
  const storeys = [...new Set(doc.nodes.map((n) => n.grid[2]))].sort((a, b) => a - b);
  const nodes = [...doc.nodes].sort((a, b) => a.grid[2] - b.grid[2] || a.id.localeCompare(b.id));

  return (
    <>
      <section className="summary">
        <h2>{doc.metadata.name}</h2>
        {doc.metadata.description && <p>{doc.metadata.description}</p>}
        <p className="meta">
          Loaded from <code>{source}</code> · schema v{doc.schemaVersion} · {doc.nodes.length} nodes ·{' '}
          {doc.edges.length} edges · storeys (z): {storeys.join(', ') || '—'}
        </p>
      </section>

      <section>
        <h3>Nodes</h3>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Type</th>
              <th>Spatial cell [x, y, z]</th>
              <th>Diagram position [x, y]</th>
              <th>Attributes</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((n) => {
              const pos = doc.diagram.positions[n.id];
              return (
                <tr key={n.id}>
                  <td><code>{n.id}</code></td>
                  <td>{n.typeId}</td>
                  <td>{fmtGrid(n.grid)}</td>
                  <td>{pos ? fmtGrid(pos) : <em>none</em>}</td>
                  <td>
                    {Object.entries(n.attributes)
                      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                      .join(', ') || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Edges (explicit relationships only)</h3>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Source</th>
              <th>Target</th>
              <th>Kind</th>
              <th>Direction</th>
            </tr>
          </thead>
          <tbody>
            {doc.edges.map((e) => (
              <tr key={e.id}>
                <td><code>{e.id}</code></td>
                <td><code>{e.source}</code></td>
                <td><code>{e.target}</code></td>
                <td>{e.kind}</td>
                <td>{isVerticalKind(e.kind) ? 'vertical' : 'horizontal'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
