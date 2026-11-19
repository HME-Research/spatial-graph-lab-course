import { HelpTip } from '@app/ui/help';
import { useContext, useEffect, useMemo, useState } from 'react';
import { CustomAttributes, ManageAttributesLink } from '@app/attributes/CustomAttributes';
import { ManageFunctionsContext, OpenAttributesContext } from '@app/attributes/navigation';
import { MAX_ROOM_SIZE, nodeLabel, type RoomNode } from '@app/document';
import { findNodeType } from '@app/extensions';
import { nodeTypeStatus } from '@app/views/project';
import { formatGrid } from '@app/views/graph2d/diagram';
import {
  CollapsibleSection,
  describeResolution,
  IssueFeedback,
  labelOfChoice,
  POSITION_HELP,
  SIZE_HELP,
  RELATIONSHIP_KIND_CHOICES,
  RouteConfirm,
  UNDO_HINT,
} from '@app/ui';
import { typeColor } from '@core/viewer/appearance';
import { selectEdge, selectNode } from '@core/viewer/selection';
import { CalculatedRows, FieldRow } from './CalculatedValues';
import { AttributesForm, NodeChecks, StoredData, TypedAttributesForm, TypeStatusNote } from './AttributeEditors';
import { CommitInput, TripleField, TypeSelect, type CommitOutcome } from './fields';
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

/** Properties of one room: one attribute list (Function, Level, custom, calculated), geometry, relationships. */
export function NodeProperties(props: PanelProps & { readonly nodeId: number }) {
  const { design, project, nodeId } = props;
  const { issues, showIssues, clearIssues, runShared, runV2 } = useCommands(props);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  /** Bumped to reset the geometry drafts after Cancel. */
  const [resetKey, setResetKey] = useState(0);
  const openAttributes = useContext(OpenAttributesContext);
  const manageFunctions = useContext(ManageFunctionsContext);

  const v2Node: RoomNode | undefined = design.doc.nodes.find((n) => n.id === nodeId);
  const node = v2Node;

  // A stale confirmation must never be applied to a different document.
  const currentDoc = design?.doc;
  useEffect(() => setPending(null), [currentDoc]);

  const active = project?.project ?? null;
  const typesInDesign = useMemo(
    () => design.doc.nodes.map((n) => n.typeId),
    [design],
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
      // The fields show the authoritative stored geometry again; the message says what was refused
      // (phase 07, O09: a refused value must not look applied).
      setResetKey((k) => k + 1);
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
    editGeometry({ grid }, 'move');

  /** Level is the room's z (storey): editing it moves the room up or down, like Position z. */
  const commitLevel = (draft: string): boolean => {
    const z = Number(draft);
    if (draft.trim() === '' || !Number.isInteger(z)) {
      showIssues([{ path: ['grid', 2], code: 'schema', message: 'Level must be a whole number.' }]);
      return false;
    }
    return moveTo([node.grid[0], node.grid[1], z]) !== 'refused';
  };

  const functionName = typeStatus.kind === 'registered' ? typeStatus.label : node.typeId;
  const requiredRows = (
    <>
      <FieldRow
        attributeId="function"
        kind="required"
        label="Function"
        title="What the room is used for. Every room has one."
        control={
          /* Re-keyed on the stored value so the menu resets after any change (or undo). */
          <TypeSelect key={node.typeId} current={node.typeId} menu={menu} onChange={(typeId) => runShared({ type: 'set-node-type', nodeId, typeId })} />
        }
        meta={
          manageFunctions && (
            <button type="button" className="sgl-link" onClick={manageFunctions} title="Add or remove the functions this project offers">
              Edit functions
            </button>
          )
        }
      >
        <TypeStatusNote status={typeStatus} typeId={node.typeId} projectId={active?.id ?? null} />
        <NodeChecks checks={checks} />
      </FieldRow>
      <FieldRow
        attributeId="level"
        kind="required"
        label="Level"
        title="The storey the room stands on (its z position). Changing it moves the room."
        control={<CommitInput key={`level:${node.grid[2]}:${resetKey}`} label="Level" type="number" stored={String(node.grid[2])} placeholder="" onCommit={commitLevel} />}
      />
    </>
  );
  const calculatedRows = design ? <CalculatedRows design={design} collection="nodes" itemId={nodeId} /> : undefined;

  return (
    <div className="sgl-panel">
      <div className="sgl-title">
        <span className="sgl-swatch" style={{ background: typeColor(node.typeId) }} aria-hidden="true" />
        Room <span className="sgl-room-label">{label}</span>
        {label !== node.id && <code className="sgl-id" title="Permanent id (never changes)">{node.id}</code>}
      </div>

      <IssueFeedback issues={issues} context={context} onDismiss={clearIssues} />
      {pending && <RouteConfirm relationships={pending.relationships} action={pending.action} onCancel={cancelPending} onConfirm={confirmPending} />}

      <CollapsibleSection
        title="Attributes"
        sectionId="attributes"
        defaultOpen={false}
        meta={functionName}
        actions={design && v2Node && project && openAttributes ? <ManageAttributesLink onManage={() => openAttributes('nodes')} /> : undefined}
      >
        {design && v2Node && project ? (
          <CustomAttributes
            collection="nodes"
            item={v2Node}
            schema={project.attributes}
            run={runV2}
            onError={(message) => showIssues([{ path: ['attributes'], code: 'schema', message }])}
            showHeader={false}
            before={requiredRows}
            after={calculatedRows}
            {...(openAttributes && { onManage: () => openAttributes('nodes') })}
          />
        ) : (
          <>
            <section className="sgl-section sgl-custom-attributes" aria-label="Attributes">
              {requiredRows}
              {calculatedRows}
            </section>
            {specs ? (
              <>
                <TypedAttributesForm node={node} specs={specs} label={functionName} run={runShared} onLocalError={showIssues} />
                <AttributesForm key={`other:${JSON.stringify(node.attributes)}`} node={node} specs={specs} run={runShared} onLocalError={showIssues} />
              </>
            ) : (
              <AttributesForm key={JSON.stringify(node.attributes)} node={node} specs={null} run={runShared} onLocalError={showIssues} />
            )}
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Geometry"
        sectionId="geometry"
        defaultOpen={false}
        meta={`at ${formatGrid(node.grid)}${v2Node ? ` · ${v2Node.size.join('×')}` : ''}`}
      >
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
            <div className="sgl-help-row sgl-field-help">
              {!design && <span className="sgl-help">The target cell must be empty and every relationship must keep touching.</span>}
              <HelpTip topicId="graph-vs-grid" />
            </div>
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
              <div className="sgl-help-row sgl-field-help">
                <HelpTip topicId="room-size" />
              </div>
            }
          />
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Relationships" sectionId="relationships" defaultOpen={false} meta={String(incidentCount(props, nodeId))}>
        <RelationshipsV2 {...props} nodeId={nodeId} runV2={runV2} />
      </CollapsibleSection>

      <section className="sgl-section sgl-panel-actions">
        <button
          type="button"
          className="sgl-danger"
          onClick={() => runShared({ type: 'remove-node', nodeId })}
          title={`Also removes its ${incidentCount(props, nodeId)} relationship(s) and its diagram position. ${UNDO_HINT}`}
        >
          Delete room
        </button>
      </section>

      <StoredData record={node} diagramPosition={design.doc.diagram.positions[nodeId] ?? null} />
    </div>
  );
}

const incidentCount = ({ design }: PanelProps, nodeId: number): number =>
  design.doc.edges.filter((e) => e.source === nodeId || e.target === nodeId).length;

/** v2: every relationship of the room with its spatial status, and "Connect to…". */
function RelationshipsV2({ design, onSelect, nodeId, runV2 }: PanelProps & { readonly nodeId: number; readonly runV2: ReturnType<typeof useCommands>['runV2'] }) {
  const [target, setTarget] = useState('');
  if (!design) return null;
  const v2 = design.doc;
  const label = (id: number) => {
    const n = v2.nodes.find((x) => x.id === id);
    return n ? nodeLabel(n) : id;
  };
  const incident = v2.edges.filter((e) => e.source === nodeId || e.target === nodeId);
  const connected = new Set(incident.map((e) => (e.source === nodeId ? e.target : e.source)));
  const candidates = v2.nodes.filter((n) => n.id !== nodeId && !connected.has(n.id));

  const connect = () => {
    if (target === '') return;
    if (runV2({ type: 'add-edge', edge: { source: nodeId, target: Number(target) } })) setTarget('');
  };

  return (
    <section className="sgl-section">
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
    </section>
  );
}

