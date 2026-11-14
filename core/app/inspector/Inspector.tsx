import { useMemo, useState, type FormEvent } from 'react';
import {
  EDGE_KINDS,
  isEdgeGeometryValid,
  type DesignDocument,
  type EdgeKind,
  type GraphCommand,
  type GraphEdge,
  type GraphIssue,
  type GraphNode,
} from '@app/document';
import { typeColor } from '../../viewer/appearance';
import type { GraphCommandHandler, InspectorProps, SelectionHandler } from '../../viewer/contracts';
import {
  EDGE_KIND_LABELS,
  EDGE_STYLES,
  formatGrid,
  neighbourConnections,
  nextFreeId,
  orientationOf,
} from '../../viewer/graph2d/diagram';
import { IssueList } from '../../viewer/graph2d/IssueList';
import { selectEdge, selectNode } from '../../viewer/selection';
import './inspector.css';
import {
  ATTRIBUTE_KIND_LABELS,
  attributesToRows,
  defaultDraftFor,
  gridToDraft,
  parseGridDraft,
  rowsToAttributes,
  sameGrid,
  type AttributeRow,
  type AttributeValueKind,
  type GridDraft,
} from './inspectorModel';

/**
 * Right-hand inspector for the single selected node or edge. Every edit is a GraphCommand sent
 * through `onCommand`; a rejected command leaves the document unchanged and its issues are shown.
 */
export function Inspector({ doc, selection, onSelect, onCommand }: InspectorProps) {
  const node = selection.kind === 'node' ? doc.nodes.find((n) => n.id === selection.id) : undefined;
  const edge = selection.kind === 'edge' ? doc.edges.find((e) => e.id === selection.id) : undefined;
  return (
    <aside className="inspector sgl-inspector">
      <h3>Inspector</h3>
      {node ? (
        <NodePanel key={`node:${node.id}`} doc={doc} node={node} onSelect={onSelect} onCommand={onCommand} />
      ) : edge ? (
        <EdgePanel key={`edge:${edge.id}`} doc={doc} edge={edge} onSelect={onSelect} onCommand={onCommand} />
      ) : (
        <p className="meta">
          Nothing selected. Click a node or an edge in a view to inspect and edit it.
        </p>
      )}
    </aside>
  );
}

interface PanelBase {
  readonly doc: DesignDocument;
  readonly onSelect: SelectionHandler;
  readonly onCommand: GraphCommandHandler;
}

/** Shared "send a command and remember its issues" state for one panel. */
function useCommandRunner(onCommand: GraphCommandHandler) {
  const [issues, setIssues] = useState<readonly GraphIssue[]>([]);
  const run = (command: GraphCommand): boolean => {
    const outcome = onCommand(command);
    setIssues(outcome.ok ? [] : outcome.issues);
    return outcome.ok;
  };
  return { issues, setIssues, run };
}

// ---------------------------------------------------------------------------------------------
// Node

function NodePanel({ doc, node, onSelect, onCommand }: PanelBase & { readonly node: GraphNode }) {
  const { issues, setIssues, run } = useCommandRunner(onCommand);
  const knownTypes = useMemo(() => [...new Set(doc.nodes.map((n) => n.typeId))].sort(), [doc]);
  const incident = doc.edges.filter((e) => e.source === node.id || e.target === node.id);
  const neighbours = useMemo(() => neighbourConnections(doc, node.id), [doc, node.id]);
  const unconnected = neighbours.filter((n) => !n.existingEdge);

  const connect = (targetId: string, kind: EdgeKind) => {
    const id = nextFreeId('edge', doc.edges.map((e) => e.id));
    run({ type: 'add-edge', edge: { id, source: node.id, target: targetId, kind } });
  };

  return (
    <div className="sgl-panel">
      <div className="sgl-title">
        <span className="sgl-swatch" style={{ background: typeColor(node.typeId) }} />
        Node <code>{node.id}</code>
      </div>

      <IssueList issues={issues} onDismiss={() => setIssues([])} />

      {/* Re-keyed on the stored value so the draft resets after any successful change. */}
      <TypeForm key={node.typeId} node={node} knownTypes={knownTypes} run={run} />
      <GridForm key={formatGrid(node.grid)} node={node} run={run} />
      <AttributesForm key={JSON.stringify(node.attributes)} node={node} run={run} onLocalError={setIssues} />

      <section className="sgl-section">
        <h4>Connections</h4>
        {incident.length === 0 && <p className="meta">No edges yet.</p>}
        <ul className="sgl-list">
          {incident.map((e) => {
            const other = e.source === node.id ? e.target : e.source;
            return (
              <li key={e.id}>
                <button type="button" className="sgl-link" onClick={() => onSelect(selectEdge(e.id))}>
                  {EDGE_STYLES[e.kind].symbol} {e.kind}
                </button>{' '}
                to{' '}
                <button type="button" className="sgl-link" onClick={() => onSelect(selectNode(other))}>
                  {other}
                </button>
              </li>
            );
          })}
        </ul>
        {unconnected.length > 0 && (
          <>
            <p className="sgl-help">Neighbouring cells without an edge (a solid wall separates them):</p>
            <ul className="sgl-list">
              {unconnected.map((n) => (
                <li key={n.target.id}>
                  <code>{n.target.id}</code> {formatGrid(n.target.grid)}
                  <div className="sgl-buttons">
                    {n.kinds
                      .filter((k) => k.valid)
                      .map((k) => (
                        <button
                          key={k.kind}
                          type="button"
                          onClick={() => connect(n.target.id, k.kind)}
                          title={`Add a ${orientationOf(k.kind)} "${k.kind}" edge`}
                        >
                          + {k.kind}
                        </button>
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="sgl-section">
        <button type="button" className="sgl-danger" onClick={() => run({ type: 'remove-node', nodeId: node.id })}>
          Delete node
        </button>
        <p className="sgl-help">Also removes its {incident.length} edge(s) and its diagram position.</p>
      </section>
    </div>
  );
}

type Run = (command: GraphCommand) => boolean;

function TypeForm({ node, knownTypes, run }: { node: GraphNode; knownTypes: readonly string[]; run: Run }) {
  const [draft, setDraft] = useState(node.typeId);
  const listId = `sgl-types-${node.id}`;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const typeId = draft.trim();
    if (typeId !== node.typeId) run({ type: 'set-node-type', nodeId: node.id, typeId });
  };
  return (
    <form className="sgl-section" onSubmit={submit}>
      <h4>Function (node type)</h4>
      <div className="sgl-row">
        <input
          list={listId}
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          aria-label="Node type"
          spellCheck={false}
        />
        <datalist id={listId}>
          {knownTypes.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <button type="submit" disabled={draft.trim() === node.typeId}>
          Apply
        </button>
      </div>
      <p className="sgl-help">Lowercase letters, digits and “-”, e.g. gallery.</p>
    </form>
  );
}

function GridForm({ node, run }: { node: GraphNode; run: Run }) {
  const [draft, setDraft] = useState<GridDraft>(() => gridToDraft(node.grid));
  const [error, setError] = useState<string | null>(null);
  const parsed = parseGridDraft(draft);
  const unchanged = parsed.ok && sameGrid(parsed.value, node.grid);
  const setAxis = (axis: 0 | 1 | 2, value: string) => {
    const next: [string, string, string] = [...draft];
    next[axis] = value;
    setDraft(next);
    setError(null);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!parsed.ok) return setError(parsed.message);
    if (!unchanged) run({ type: 'move-node', nodeId: node.id, grid: parsed.value });
  };
  return (
    <form className="sgl-section" onSubmit={submit}>
      <h4>Spatial cell</h4>
      <div className="sgl-row">
        {(['x', 'y', 'z'] as const).map((label, axis) => (
          <label key={label} className="sgl-axis">
            {label}
            <input
              type="number"
              step={1}
              value={draft[axis]}
              onChange={(e) => setAxis(axis as 0 | 1 | 2, e.currentTarget.value)}
            />
          </label>
        ))}
        <button type="submit" disabled={unchanged}>
          Move
        </button>
      </div>
      {error && <p className="sgl-error">{error}</p>}
      <p className="sgl-help">
        z is the storey. Moving changes the physical cell only; the target must be empty and every edge must stay
        face-adjacent. The diagram position does not change.
      </p>
    </form>
  );
}

function AttributesForm({
  node,
  run,
  onLocalError,
}: {
  node: GraphNode;
  run: Run;
  onLocalError: (issues: readonly GraphIssue[]) => void;
}) {
  const initial = useMemo(() => attributesToRows(node.attributes), [node.attributes]);
  const [rows, setRows] = useState<readonly AttributeRow[]>(initial);
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);

  const update = (i: number, patch: Partial<AttributeRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = rowsToAttributes(rows);
    if (!parsed.ok) {
      onLocalError([{ path: ['attributes'], code: 'schema', message: parsed.message }]);
      return;
    }
    run({ type: 'set-node-attributes', nodeId: node.id, attributes: parsed.value });
  };

  return (
    <form className="sgl-section" onSubmit={submit}>
      <h4>Attributes</h4>
      {rows.length === 0 && <p className="meta">No attributes.</p>}
      {rows.map((row, i) => (
        <div key={i} className="sgl-attr">
          <input
            className="sgl-attr-key"
            value={row.key}
            placeholder="name"
            aria-label={`Attribute ${i + 1} name`}
            onChange={(e) => update(i, { key: e.currentTarget.value })}
          />
          <select
            value={row.kind}
            aria-label={`Attribute ${i + 1} kind`}
            onChange={(e) => {
              const kind = e.currentTarget.value as AttributeValueKind;
              update(i, { kind, value: defaultDraftFor(kind) });
            }}
          >
            {(Object.keys(ATTRIBUTE_KIND_LABELS) as AttributeValueKind[]).map((k) => (
              <option key={k} value={k}>
                {ATTRIBUTE_KIND_LABELS[k]}
              </option>
            ))}
          </select>
          {row.kind === 'boolean' ? (
            <select
              value={row.value}
              aria-label={`Attribute ${i + 1} value`}
              onChange={(e) => update(i, { value: e.currentTarget.value })}
            >
              <option value="true">yes</option>
              <option value="false">no</option>
            </select>
          ) : (
            <input
              className="sgl-attr-value"
              type={row.kind === 'number' ? 'number' : 'text'}
              value={row.kind === 'none' ? '' : row.value}
              disabled={row.kind === 'none'}
              placeholder={row.kind === 'none' ? 'null' : 'value'}
              aria-label={`Attribute ${i + 1} value`}
              onChange={(e) => update(i, { value: e.currentTarget.value })}
            />
          )}
          <button
            type="button"
            className="sgl-icon"
            title="Remove attribute"
            aria-label={`Remove attribute ${row.key || i + 1}`}
            onClick={() => setRows(rows.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <div className="sgl-buttons">
        <button type="button" onClick={() => setRows([...rows, { key: '', kind: 'text', value: '' }])}>
          + Add attribute
        </button>
        <button type="submit" disabled={!dirty}>
          Save attributes
        </button>
        {dirty && (
          <button type="button" className="sgl-link" onClick={() => setRows(initial)}>
            Reset
          </button>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------------------------
// Edge

function EdgePanel({ doc, edge, onSelect, onCommand }: PanelBase & { readonly edge: GraphEdge }) {
  const { issues, setIssues, run } = useCommandRunner(onCommand);
  const source = doc.nodes.find((n) => n.id === edge.source);
  const target = doc.nodes.find((n) => n.id === edge.target);
  const validFor = (kind: EdgeKind) =>
    source !== undefined && target !== undefined && isEdgeGeometryValid(kind, source.grid, target.grid);

  return (
    <div className="sgl-panel">
      <div className="sgl-title">
        Edge <code>{edge.id}</code>
      </div>

      <IssueList issues={issues} onDismiss={() => setIssues([])} />

      <section className="sgl-section">
        <h4>Connects</h4>
        <ul className="sgl-list">
          {[source, target].map(
            (n, i) =>
              n && (
                <li key={i}>
                  <button type="button" className="sgl-link" onClick={() => onSelect(selectNode(n.id))}>
                    {n.id}
                  </button>{' '}
                  <span className="meta">
                    {n.typeId} · {formatGrid(n.grid)}
                  </span>
                </li>
              ),
          )}
        </ul>
        <p className="sgl-help">
          A {orientationOf(edge.kind)} relationship{orientationOf(edge.kind) === 'vertical' ? ' between storeys' : ''}.
          It describes access, not a built staircase or corridor.
        </p>
      </section>

      <section className="sgl-section">
        <h4>Kind</h4>
        <select
          value={edge.kind}
          aria-label="Edge kind"
          onChange={(e) => run({ type: 'change-edge-kind', edgeId: edge.id, kind: e.currentTarget.value as EdgeKind })}
        >
          {EDGE_KINDS.map((kind) => (
            <option key={kind} value={kind} disabled={!validFor(kind)}>
              {EDGE_STYLES[kind].symbol} {EDGE_KIND_LABELS[kind]}
              {validFor(kind) ? '' : ' — needs other cells'}
            </option>
          ))}
        </select>
        <p className="sgl-help">Door/open join cells on the same storey; atrium/vertical access join storeys.</p>
      </section>

      <section className="sgl-section">
        <button type="button" className="sgl-danger" onClick={() => run({ type: 'remove-edge', edgeId: edge.id })}>
          Delete edge
        </button>
        <p className="sgl-help">The two cells stay; a solid wall will separate them.</p>
      </section>
    </div>
  );
}
