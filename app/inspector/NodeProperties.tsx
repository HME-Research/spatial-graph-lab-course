import { useEffect, useMemo, useState } from 'react';
import type { EdgeKind, GraphNode } from '@app/document';
import { MAX_ROOM_SIZE, nodeLabel, type RoomNode } from '@app/document/v2';
import { findNodeType } from '@app/extensions';
import { nodeTypeStatus } from '@app/views/project';
import {
  EDGE_KIND_LABELS,
  EDGE_STYLES,
  formatGrid,
  neighbourConnections,
  nextFreeId,
  orientationOf,
} from '@app/views/graph2d/diagram';
import {
  describeResolution,
  IssueFeedback,
  labelOfChoice,
  POSITION_HELP,
  RELATIONSHIP_KIND_CHOICES,
  RouteConfirm,
  SIZE_HELP,
  UNDO_HINT,
} from '@app/ui';
import { typeColor } from '@core/viewer/appearance';
import { selectEdge, selectNode } from '@core/viewer/selection';
import { AttributesForm, NodeChecks, StoredData, TypedAttributesForm, TypeStatusNote } from './AttributeEditors';
import { TripleField, TypeSelect, type CommitOutcome } from './fields';
import { messageContextFor, useCommands, type PanelProps } from './panelSupport';
import { planGeometryEdit, POSITION_BOUNDS, tripleKey, typeMenu, type Triple, type TripleBounds } from './propertiesModel';

const SIZE_BOUNDS: TripleBounds = { names: ['x', 'y', 'z'], min: 1, max: MAX_ROOM_SIZE };

type GeometryRequest = { readonly grid?: Triple; readonly size?: Triple };

interface PendingConfirmation {
  readonly request: GeometryRequest;
  readonly relationships: readonly string[];
  readonly action: 'move' | 'resize';
}

const toCoord = (t: Triple): [number, number, number] => [t[0], t[1], t[2]];

/** Properties of one room: type, position (and v2 size), attributes, relationships. */
export function NodeProperties(props: PanelProps & { readonly nodeId: string }) {
  const { doc, design, project, nodeId } = props;
  const { issues, showIssues, clearIssues, runShared, runV1, runV2 } = useCommands(props);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  /** Bumped to reset the geometry drafts after Cancel. */
  const [resetKey, setResetKey] = useState(0);

  const v2Node: RoomNode | undefined = design?.doc.nodes.find((n) => n.id === nodeId);
  const v1Node: GraphNode | undefined = doc.nodes.find((n) => n.id === nodeId);
  const node = design ? v2Node : v1Node;

  // A stale confirmation must never be applied to a different document.
  const currentDoc = design?.doc;
  useEffect(() => setPending(null), [currentDoc]);

  const active = project?.project ?? null;
  const typesInDesign = useMemo(
    () => (design ? design.doc.nodes.map((n) => n.typeId) : doc.nodes.map((n) => n.typeId)),
    [design, doc],
  );
  if (!node) return null;

  const menu = typeMenu(active, typesInDesign, node.typeId);
  const typeStatus = nodeTypeStatus(active, node.typeId);
  const checks = (project?.conformance ?? []).filter((d) => d.subject.kind === 'node' && d.subject.id === node.id);
  const specs = typeStatus.kind === 'registered' ? (findNodeType(active!, node.typeId)?.definition.attributes ?? {}) : null;
  const context = messageContextFor(props, node.id);
  const label = v2Node ? nodeLabel(v2Node) : node.id;

  /** v2: preview first; room overlaps are refused, corridor clashes ask for confirmation. */
  const editGeometry = (request: GeometryRequest, action: 'move' | 'resize'): CommitOutcome => {
    if (!design) return 'refused';
    const proposal = design.proposeEdit({
      nodeId,
      ...(request.grid && { grid: toCoord(request.grid) }),
      ...(request.size && { size: toCoord(request.size) }),
    });
    const plan = planGeometryEdit(proposal, design.doc, nodeId);
    if (plan.kind === 'reject') {
      setPending(null);
      showIssues(plan.issues);
      return 'refused';
    }
    if (plan.kind === 'confirm') {
      clearIssues();
      setPending({ request, relationships: plan.relationships, action });
      return 'pending';
    }
    setPending(null);
    return runV2({
      type: 'set-node-geometry',
      nodeId,
      ...(request.grid && { grid: toCoord(request.grid) }),
      ...(request.size && { size: toCoord(request.size) }),
    })
      ? 'applied'
      : 'refused';
  };

  const confirmPending = () => {
    if (!pending) return;
    const { request } = pending;
    setPending(null);
    const ok = runV2({
      type: 'set-node-geometry',
      nodeId,
      ...(request.grid && { grid: toCoord(request.grid) }),
      ...(request.size && { size: toCoord(request.size) }),
      confirmRouteDisplacement: true,
    });
    if (!ok) setResetKey((k) => k + 1);
  };

  const cancelPending = () => {
    setPending(null);
    setResetKey((k) => k + 1);
  };

  const moveTo = (grid: Triple): CommitOutcome =>
    design ? editGeometry({ grid }, 'move') : runV1({ type: 'move-node', nodeId, grid: toCoord(grid) }) ? 'applied' : 'refused';

  const confirmation = (action: 'move' | 'resize') =>
    pending?.action === action ? (
      <RouteConfirm relationships={pending.relationships} action={action} onCancel={cancelPending} onConfirm={confirmPending} />
    ) : null;

  return (
    <div className="sgl-panel">
      <div className="sgl-title">
        <span className="sgl-swatch" style={{ background: typeColor(node.typeId) }} aria-hidden="true" />
        Room <span className="sgl-room-label">{label}</span>
        {label !== node.id && <code className="sgl-id" title="Permanent id (never changes)">{node.id}</code>}
      </div>

      <IssueFeedback issues={issues} context={context} onDismiss={clearIssues} />

      <section className="sgl-section">
        <h4>Room type</h4>
        {/* Re-keyed on the stored value so the menu resets after any change (or undo). */}
        <TypeSelect
          key={node.typeId}
          current={node.typeId}
          menu={menu}
          onChange={(typeId) => runShared({ type: 'set-node-type', nodeId, typeId })}
        />
        <TypeStatusNote status={typeStatus} typeId={node.typeId} projectId={active?.id ?? null} />
      </section>
      <NodeChecks checks={checks} />

      <TripleField
        key={`grid:${tripleKey(node.grid)}:${resetKey}`}
        legend={design ? 'Position (lowest corner)' : 'Position (cell)'}
        info={POSITION_HELP}
        axes={['x', 'y', 'z']}
        bounds={POSITION_BOUNDS}
        stored={node.grid}
        onCommit={moveTo}
        onEscape={() => {
          if (pending?.action === 'move') cancelPending();
        }}
        footer={
          <>
            {confirmation('move')}
            <p className="sgl-help">
              z is the storey. This moves the physical room{design ? '' : '; the target cell must be empty and every relationship must keep touching'}. Moving
              the node in Graph 2D only rearranges the diagram.
            </p>
          </>
        }
      />

      {design && v2Node && (
        <TripleField
          key={`size:${tripleKey(v2Node.size)}:${resetKey}`}
          legend="Size (cells)"
          info={SIZE_HELP}
          axes={['x', 'y', 'z']}
          bounds={SIZE_BOUNDS}
          stored={v2Node.size}
          onCommit={(size) => editGeometry({ size }, 'resize')}
          onEscape={() => {
            if (pending?.action === 'resize') cancelPending();
          }}
          footer={
            <>
              {confirmation('resize')}
              <p className="sgl-help">Whole cells, 1 to {MAX_ROOM_SIZE}. The room grows from its position.</p>
            </>
          }
        />
      )}

      {specs ? (
        <>
          <TypedAttributesForm
            node={node}
            specs={specs}
            label={typeStatus.kind === 'registered' ? typeStatus.label : node.typeId}
            run={runShared}
            onLocalError={showIssues}
          />
          <AttributesForm key={`other:${JSON.stringify(node.attributes)}`} node={node} specs={specs} run={runShared} onLocalError={showIssues} />
        </>
      ) : (
        <AttributesForm key={JSON.stringify(node.attributes)} node={node} specs={null} run={runShared} onLocalError={showIssues} />
      )}

      {design ? (
        <RelationshipsV2 {...props} nodeId={nodeId} runV2={runV2} />
      ) : (
        <ConnectionsV1 {...props} nodeId={nodeId} runV1={runV1} />
      )}

      <section className="sgl-section">
        <button type="button" className="sgl-danger" onClick={() => runShared({ type: 'remove-node', nodeId })}>
          Delete room
        </button>
        <p className="sgl-help">
          Also removes its {incidentCount(props, nodeId)} relationship(s) and its diagram position. {UNDO_HINT}
        </p>
      </section>

      <StoredData record={node} diagramPosition={(design ? design.doc : doc).diagram.positions[nodeId] ?? null} />
    </div>
  );
}

const incidentCount = ({ doc, design }: PanelProps, nodeId: string): number =>
  (design ? design.doc.edges : doc.edges).filter((e) => e.source === nodeId || e.target === nodeId).length;

/** v2: every relationship of the room with its spatial status, and "Connect to…". */
function RelationshipsV2({ design, onSelect, nodeId, runV2 }: PanelProps & { readonly nodeId: string; readonly runV2: ReturnType<typeof useCommands>['runV2'] }) {
  const [target, setTarget] = useState('');
  if (!design) return null;
  const v2 = design.doc;
  const label = (id: string) => {
    const n = v2.nodes.find((x) => x.id === id);
    return n ? nodeLabel(n) : id;
  };
  const incident = v2.edges.filter((e) => e.source === nodeId || e.target === nodeId);
  const connected = new Set(incident.map((e) => (e.source === nodeId ? e.target : e.source)));
  const candidates = v2.nodes.filter((n) => n.id !== nodeId && !connected.has(n.id));

  const connect = () => {
    if (target === '') return;
    const id = nextFreeId('edge', v2.edges.map((e) => e.id));
    if (runV2({ type: 'add-edge', edge: { id, source: nodeId, target } })) setTarget('');
  };

  return (
    <section className="sgl-section">
      <h4>Relationships</h4>
      {incident.length === 0 && <p className="meta">No relationships yet.</p>}
      <ul className="sgl-list sgl-relations">
        {incident.map((e) => {
          const other = e.source === nodeId ? e.target : e.source;
          const resolution = design.spatial.byEdge.get(e.id);
          const status = resolution ? describeResolution(resolution) : null;
          return (
            <li key={e.id}>
              <button type="button" className="sgl-link" onClick={() => onSelect(selectEdge(e.id))} title="Show this relationship">
                {labelOfChoice(RELATIONSHIP_KIND_CHOICES, e.kind)}
              </button>{' '}
              with{' '}
              <button type="button" className="sgl-link" onClick={() => onSelect(selectNode(other))} title="Show this room">
                room {label(other)}
              </button>
              {status && (
                <span className={`sgl-chip sgl-chip-${status.tone}`} title={status.detail}>
                  {status.title}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {candidates.length > 0 && (
        <div className="sgl-row sgl-connect">
          <select value={target} aria-label="Room to connect to" onChange={(e) => setTarget(e.currentTarget.value)}>
            <option value="">Connect to room…</option>
            {candidates.map((n) => (
              <option key={n.id} value={n.id}>
                {nodeLabel(n)} ({n.typeId})
              </option>
            ))}
          </select>
          <button type="button" disabled={target === ''} onClick={connect} title="Add an Access relationship (you can change it to Open afterwards)">
            Connect
          </button>
        </div>
      )}
      <p className="sgl-help">Rooms do not need to touch to be related. If a relationship cannot be built yet, it is kept and marked “Not built”.</p>
    </section>
  );
}

/** v1: incident edges and face-adjacent neighbours that could be connected. */
function ConnectionsV1({ doc, onSelect, nodeId, runV1 }: PanelProps & { readonly nodeId: string; readonly runV1: ReturnType<typeof useCommands>['runV1'] }) {
  const incident = doc.edges.filter((e) => e.source === nodeId || e.target === nodeId);
  const neighbours = useMemo(() => neighbourConnections(doc, nodeId), [doc, nodeId]);
  const unconnected = neighbours.filter((n) => !n.existingEdge);
  const connect = (targetId: string, kind: EdgeKind) => {
    const id = nextFreeId('edge', doc.edges.map((e) => e.id));
    runV1({ type: 'add-edge', edge: { id, source: nodeId, target: targetId, kind } });
  };
  return (
    <section className="sgl-section">
      <h4>Relationships</h4>
      {incident.length === 0 && <p className="meta">No relationships yet.</p>}
      <ul className="sgl-list">
        {incident.map((e) => {
          const other = e.source === nodeId ? e.target : e.source;
          return (
            <li key={e.id}>
              <button type="button" className="sgl-link" onClick={() => onSelect(selectEdge(e.id))} title="Show this relationship">
                {EDGE_STYLES[e.kind].symbol} {EDGE_KIND_LABELS[e.kind]}
              </button>{' '}
              with{' '}
              <button type="button" className="sgl-link" onClick={() => onSelect(selectNode(other))} title="Show this room">
                room {other}
              </button>
            </li>
          );
        })}
      </ul>
      {unconnected.length > 0 && (
        <>
          <p className="sgl-help">Touching rooms without a relationship (a solid wall separates them):</p>
          <ul className="sgl-list">
            {unconnected.map((n) => (
              <li key={n.target.id}>
                room <code>{n.target.id}</code> {formatGrid(n.target.grid)}
                <div className="sgl-buttons">
                  {n.kinds
                    .filter((k) => k.valid)
                    .map((k) => (
                      <button
                        key={k.kind}
                        type="button"
                        onClick={() => connect(n.target.id, k.kind)}
                        title={`Add a ${orientationOf(k.kind)} “${EDGE_KIND_LABELS[k.kind]}” relationship`}
                      >
                        + {EDGE_KIND_LABELS[k.kind]}
                      </button>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
