import { useMemo, useState, type FormEvent } from 'react';
import {
  EDGE_KINDS,
  isEdgeGeometryValid,
  type AttributeValue,
  type DesignDocument,
  type EdgeKind,
  type GraphCommand,
  type GraphEdge,
  type GraphIssue,
  type GraphNode,
} from '@app/document';
import { typeColor } from '@core/viewer/appearance';
import { findNodeType, type ActiveProject, type AttributeSpecs, type ExtensionDiagnostic } from '@app/extensions';
import type { GraphCommandHandler, InspectorProps, SelectionHandler } from '@app/views/contracts';
import { nodeTypeStatus, typeDisplayName, type NodeTypeStatus, type ProjectViewContext } from '@app/views/project';
import {
  EDGE_KIND_LABELS,
  EDGE_STYLES,
  formatGrid,
  neighbourConnections,
  nextFreeId,
  orientationOf,
} from '@app/views/graph2d/diagram';
import { IssueList } from '@app/views/graph2d/IssueList';
import { selectEdge, selectNode } from '@core/viewer/selection';
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
import {
  fieldDraft,
  parseFieldDraft,
  setTypedAttributeCommand,
  setUndeclaredAttributesCommand,
  typedFields,
  undeclaredAttributes,
  type TypedField,
} from './typedAttributes';

/**
 * Right-hand inspector for the single selected node or edge. Every edit is a GraphCommand sent
 * through `onCommand`; a rejected command leaves the document unchanged and its issues are shown.
 */
export function Inspector({ doc, selection, onSelect, onCommand, project }: InspectorProps) {
  const node = selection.kind === 'node' ? doc.nodes.find((n) => n.id === selection.id) : undefined;
  const edge = selection.kind === 'edge' ? doc.edges.find((e) => e.id === selection.id) : undefined;
  return (
    <div className="inspector sgl-inspector">
      {node ? (
        <NodePanel key={`node:${node.id}`} doc={doc} node={node} project={project} onSelect={onSelect} onCommand={onCommand} />
      ) : edge ? (
        <EdgePanel key={`edge:${edge.id}`} doc={doc} edge={edge} onSelect={onSelect} onCommand={onCommand} />
      ) : (
        <div className="sgl-panel">
          <p className="meta">Nothing selected. Click a node or an edge in a view to inspect and edit it.</p>
          <DesignSummary doc={doc} />
        </div>
      )}
    </div>
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

function NodePanel({ doc, node, project, onSelect, onCommand }: PanelBase & { readonly node: GraphNode; readonly project: ProjectViewContext | undefined }) {
  const { issues, setIssues, run } = useCommandRunner(onCommand);
  const active = project?.project ?? null;
  const knownTypes = useMemo(
    () => [...new Set([...(active?.nodeTypes.map((t) => t.id) ?? []), ...doc.nodes.map((n) => n.typeId)])].sort(),
    [doc, active],
  );
  const typeStatus = nodeTypeStatus(active, node.typeId);
  const checks = (project?.conformance ?? []).filter((d) => d.subject.kind === 'node' && d.subject.id === node.id);
  // Typed attribute controls only for a valid, registered type.
  const specs = typeStatus.kind === 'registered' ? (findNodeType(active!, node.typeId)?.definition.attributes ?? {}) : null;
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
      <TypeForm key={node.typeId} node={node} knownTypes={knownTypes} project={active} status={typeStatus} run={run} />
      <NodeChecks checks={checks} />
      <GridForm key={formatGrid(node.grid)} node={node} run={run} />
      {specs ? (
        <>
          <TypedAttributesForm node={node} specs={specs} label={typeStatus.kind === 'registered' ? typeStatus.label : node.typeId} run={run} onLocalError={setIssues} />
          <AttributesForm
            key={`other:${JSON.stringify(node.attributes)}`}
            node={node}
            specs={specs}
            run={run}
            onLocalError={setIssues}
          />
        </>
      ) : (
        <AttributesForm key={JSON.stringify(node.attributes)} node={node} specs={null} run={run} onLocalError={setIssues} />
      )}

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

      <StoredData record={node} diagramPosition={doc.diagram.positions[node.id] ?? null} />
    </div>
  );
}

type Run = (command: GraphCommand) => boolean;

function TypeForm({
  node,
  knownTypes,
  project,
  status,
  run,
}: {
  node: GraphNode;
  knownTypes: readonly string[];
  project: ActiveProject | null;
  status: NodeTypeStatus;
  run: Run;
}) {
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
            <option key={t} value={t} label={typeDisplayName(nodeTypeStatus(project, t), t)} />
          ))}
        </datalist>
        <button type="submit" disabled={draft.trim() === node.typeId}>
          Apply
        </button>
      </div>
      <TypeStatusNote status={status} typeId={node.typeId} projectId={project?.id ?? null} />
    </form>
  );
}

/** How the active project knows the node's current type. The stored value is never changed. */
function TypeStatusNote({ status, typeId, projectId }: { status: NodeTypeStatus; typeId: string; projectId: string | null }) {
  switch (status.kind) {
    case 'no-project':
      return <p className="sgl-help">Lowercase letters, digits and “-”, e.g. gallery.</p>;
    case 'registered':
      return (
        <p className="sgl-help">
          <strong>{status.label}</strong> — defined in <code>{status.file}</code>.
        </p>
      );
    case 'undefined-type':
      return (
        <p className="sgl-warning">
          ⚠ Project “{projectId}” does not define type “{typeId}”. It keeps the fallback colour and façade; the value is kept.
        </p>
      );
    case 'broken':
      return (
        <div className="sgl-error">
          ✖ The definition of “{typeId}” in <code>{status.file}</code> is invalid, so this type is disabled:
          <ul className="sgl-list">
            {status.problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      );
  }
}

const SEVERITY_ICON = { error: '✖', warning: '⚠', info: 'ℹ' } as const;

/** Conformance of this node to its project type (never blocks editing). */
function NodeChecks({ checks }: { checks: readonly ExtensionDiagnostic[] }) {
  // Type problems are explained by the type note above; list the rest here.
  const shown = checks.filter((d) => d.code !== 'unknown-node-type' && d.code !== 'broken-node-type');
  if (shown.length === 0) return null;
  return (
    <section className="sgl-section">
      <h4>Checks</h4>
      <ul className="sgl-checks">
        {shown.map((d) => (
          <li key={d.id} className={`sgl-check-${d.severity}`}>
            {SEVERITY_ICON[d.severity]} {d.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

const NO_VALUE = '';
const INVALID_VALUE = '\u0000invalid';

/**
 * Controls generated from the type's attribute declarations. Each change is one validated
 * command that keeps every other stored attribute; defaults are shown, never written.
 */
function TypedAttributesForm({
  node,
  specs,
  label,
  run,
  onLocalError,
}: {
  node: GraphNode;
  specs: AttributeSpecs;
  label: string;
  run: Run;
  onLocalError: (issues: readonly GraphIssue[]) => void;
}) {
  const fields = typedFields(specs, node.attributes);
  const send = (key: string, value: AttributeValue | undefined) => {
    const command = setTypedAttributeCommand(node, specs, key, value);
    if (!command.ok) onLocalError([{ path: ['attributes', key], code: 'schema', message: command.message }]);
    else run(command.value);
  };
  return (
    <section className="sgl-section">
      <h4>{label} attributes</h4>
      {fields.length === 0 && <p className="meta">This type declares no attributes.</p>}
      {fields.map((field) => (
        <TypedFieldControl key={`${field.key}:${JSON.stringify(field.stored)}`} field={field} send={send} />
      ))}
    </section>
  );
}

function TypedFieldControl({ field, send }: { field: TypedField; send: (key: string, value: AttributeValue | undefined) => void }) {
  const { key, spec, status, stored, defaultValue } = field;
  const [draft, setDraft] = useState(() => fieldDraft(field));
  const noValueLabel = `— no value${defaultValue !== undefined ? ` (default ${JSON.stringify(defaultValue)})` : ''}`;
  const choice = (options: readonly (readonly [string, string])[]) => (
    <select
      aria-label={`${key} value`}
      value={status === 'invalid' ? INVALID_VALUE : status === 'missing' ? NO_VALUE : String(stored)}
      onChange={(e) => {
        const v = e.currentTarget.value;
        if (v === INVALID_VALUE) return;
        send(key, v === NO_VALUE ? undefined : parseFieldDraft(spec, v));
      }}
    >
      <option value={NO_VALUE}>{noValueLabel}</option>
      {options.map(([value, text]) => (
        <option key={value} value={value}>
          {text}
        </option>
      ))}
      {status === 'invalid' && (
        <option value={INVALID_VALUE} disabled>
          {JSON.stringify(stored)} (invalid — kept)
        </option>
      )}
    </select>
  );

  let control;
  if (spec.kind === 'enum') control = choice(spec.values.map((v) => [v, v] as const));
  else if (spec.kind === 'boolean') control = choice([['true', 'yes (true)'], ['false', 'no (false)']]);
  else {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      send(key, parseFieldDraft(spec, draft));
    };
    control = (
      <form className="sgl-row" onSubmit={submit}>
        <input
          aria-label={`${key} value`}
          type={spec.kind === 'number' ? 'number' : 'text'}
          step="any"
          value={draft}
          placeholder={defaultValue !== undefined ? `default ${JSON.stringify(defaultValue)}` : 'no value'}
          onChange={(e) => setDraft(e.currentTarget.value)}
        />
        <button type="submit" disabled={draft === fieldDraft(field) && status !== 'invalid'}>
          Set
        </button>
        {stored !== undefined && (
          <button type="button" title="Remove the stored value" onClick={() => send(key, undefined)}>
            Clear
          </button>
        )}
      </form>
    );
  }

  return (
    <div className="sgl-typed">
      <div className="sgl-typed-label">
        <code>{key}</code> <span className="sgl-help">{field.accepts}</span>
      </div>
      {control}
      {status === 'invalid' && (
        <p className="sgl-warning">
          ⚠ Stored value {JSON.stringify(stored)} is not valid; it is kept until you change it
          {defaultValue !== undefined ? `, and the default ${JSON.stringify(defaultValue)} is used meanwhile` : ''}.
        </p>
      )}
    </div>
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

/**
 * Free-form attribute rows. With `specs` (a valid registered type) it edits only the attributes
 * the type does not declare, keeping declared values as stored; without, it edits them all.
 */
function AttributesForm({
  node,
  specs,
  run,
  onLocalError,
}: {
  node: GraphNode;
  specs: AttributeSpecs | null;
  run: Run;
  onLocalError: (issues: readonly GraphIssue[]) => void;
}) {
  const initial = useMemo(
    () => attributesToRows(specs ? undeclaredAttributes(specs, node.attributes) : node.attributes),
    [node.attributes, specs],
  );
  const [rows, setRows] = useState<readonly AttributeRow[]>(initial);
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);

  const update = (i: number, patch: Partial<AttributeRow>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (specs) {
      const command = setUndeclaredAttributesCommand(node, specs, rows);
      if (!command.ok) onLocalError([{ path: ['attributes'], code: 'schema', message: command.message }]);
      else run(command.value);
      return;
    }
    const parsed = rowsToAttributes(rows);
    if (!parsed.ok) {
      onLocalError([{ path: ['attributes'], code: 'schema', message: parsed.message }]);
      return;
    }
    run({ type: 'set-node-attributes', nodeId: node.id, attributes: parsed.value });
  };

  return (
    <form className="sgl-section" onSubmit={submit}>
      <h4>{specs ? 'Other attributes' : 'Attributes'}</h4>
      {specs && <p className="sgl-help">Not declared by the type. They are kept exactly as stored.</p>}
      {rows.length === 0 && <p className="meta">{specs ? 'None.' : 'No attributes.'}</p>}
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

      <StoredData record={edge} />
    </div>
  );
}

/** The selected item exactly as stored in the document (read-only). */
function StoredData({
  record,
  diagramPosition,
}: {
  readonly record: GraphNode | GraphEdge;
  /** Nodes only: their diagram position, or null when they have none. */
  readonly diagramPosition?: readonly number[] | null;
}) {
  return (
    <details className="sgl-section sgl-data">
      <summary>Stored data</summary>
      {diagramPosition !== undefined && (
        <p className="sgl-help">
          Diagram position (2D only, never moves the cell): {diagramPosition ? formatGrid(diagramPosition) : 'none'}
        </p>
      )}
      <pre>{JSON.stringify(record, null, 2)}</pre>
    </details>
  );
}

/** Shown when nothing is selected: what the loaded design contains. */
function DesignSummary({ doc }: { readonly doc: DesignDocument }) {
  const storeys = [...new Set(doc.nodes.map((n) => n.grid[2]))].sort((a, b) => a - b);
  const horizontal = doc.edges.filter((e) => orientationOf(e.kind) === 'horizontal').length;
  return (
    <section className="sgl-section">
      <h4>Design</h4>
      <p className="sgl-design-name">{doc.metadata.name}</p>
      {doc.metadata.description && <p className="sgl-help">{doc.metadata.description}</p>}
      <p className="sgl-help">
        Schema v{doc.schemaVersion} · {doc.nodes.length} nodes · {doc.edges.length} edges ({horizontal} horizontal,{' '}
        {doc.edges.length - horizontal} vertical) · storeys (z): {storeys.join(', ') || '—'}
      </p>
    </section>
  );
}
