import { HelpTip } from '@app/ui/help';
import { useContext, useEffect, useMemo, useState } from 'react';
import { AttributeSection } from '@app/attributes/AttributeSection';
import { sourceResolver } from '@app/attributes/attributeSources';
import { CustomAttributes, ManageAttributesLink } from '@app/attributes/CustomAttributes';
import { ManageFunctionsContext, OpenAttributesContext } from '@app/attributes/navigation';
import { NODE_BUILT_IN_ATTRIBUTES } from '@app/attributes/sections';
import { MAX_ROOM_SIZE, nodeLabel, type RoomNode } from '@app/document';
import { attributesOutsideSchema, findFunction } from '@app/extensions';
import { duplicateRoom } from '@app/views/duplicateRoom';
import { functionStatus } from '@app/views/project';
import { CollapsibleSection, describeResolution, IssueFeedback, labelOfChoice, RELATIONSHIP_KIND_CHOICES, RouteConfirm, UNDO_HINT } from '@app/ui';
import { useFunctionColour, useFunctionName } from '@app/views/functionColour';
import { selectEdge, selectNode } from '@core/viewer/selection';
import { boundaryShiftsOf } from '@app/building';
import { roomAreaView } from './boundaryShiftModel';
import { CalculatedRows, FieldRow } from './CalculatedValues';
import { AttributesForm, NodeChecks, StoredData, TypedAttributesForm, TypeStatusNote } from './AttributeEditors';
import { CommitInput, TypeSelect, type CommitOutcome } from './fields';
import { messageContextFor, useCommands, type PanelProps } from './panelSupport';
import { GEOMETRY_ROWS, geometryDraftEdit, planGeometryEdit, typeMenu, type Triple } from './propertiesModel';

/** Tooltips of the Geometry attributes (each ONE row with three values: x | y | z). */
const GEOMETRY_TITLES: Readonly<Record<'position' | 'size', string>> = {
  position: 'Where the room’s lowest corner is, in cells: x, y and z (z is the Level, the storey it stands on). Changing it moves the room.',
  size: `How many cells the room spans along x and y, and how many storeys tall it is (z, Floors); each 1–${MAX_ROOM_SIZE}. Changing it resizes the room.`,
};

type GeometryRequest = { readonly position?: Triple; readonly size?: Triple };

interface PendingConfirmation {
  readonly request: GeometryRequest;
  readonly relationships: readonly string[];
  readonly action: 'move' | 'resize';
}

const toCoord = (t: Triple): [number, number, number] => [t[0], t[1], t[2]];

/**
 * Properties of one room, in the five attribute sections (Programme P4, `sections.ts`): Identity
 * (id, locked), Required by the app (Function), Geometry (Position and Size, one row each with the
 * values x | y | z), Custom (tagged by source), Calculated (locked); then relationships.
 */
export function NodeProperties(props: PanelProps & { readonly nodeId: number }) {
  const { design, project, nodeId } = props;
  const functionColour = useFunctionColour();
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
    () => design.doc.nodes.map((n) => n.function),
    [design],
  );
  if (!node) return null;

  const menu = typeMenu(active, typesInDesign, node.function);
  const typeStatus = functionStatus(active, node.function);
  const checks = (project?.conformance ?? []).filter((d) => d.subject.kind === 'node' && d.subject.id === node.id);
  const specs = typeStatus.kind === 'registered' ? (findFunction(active!, node.function)?.definition.custom ?? {}) : null;
  const context = messageContextFor(props, node.id);
  const label = v2Node ? nodeLabel(v2Node) : node.id;

  /** v2: preview first; room overlaps are refused, corridor clashes ask for confirmation. */
  const editGeometry = (request: GeometryRequest, action: 'move' | 'resize'): CommitOutcome => {
    if (!design) return 'refused';
    const proposal = design.proposeEdit({
      nodeId,
      ...(request.position && { position: toCoord(request.position) }),
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
      ...(request.position && { position: toCoord(request.position) }),
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
      ...(request.position && { position: toCoord(request.position) }),
      ...(request.size && { size: toCoord(request.size) }),
      confirmRouteDisplacement: true,
    });
    if (!ok) setResetKey((k) => k + 1);
  };

  const cancelPending = () => {
    setPending(null);
    setResetKey((k) => k + 1);
  };

  /**
   * One Geometry value (e.g. Position z, the Level): the other axes keep their stored
   * values; the edit goes through the same preview and `set-node-geometry` command as the
   * move/resize gizmo, so a refused edit (overlap, size limit) shows why and changes nothing, and a
   * successful one is one undo step.
   */
  const commitGeometry = (rowId: string, name: string) => (draft: string): boolean => {
    const decision = geometryDraftEdit(node, rowId, name, draft, MAX_ROOM_SIZE);
    if (decision.kind === 'unchanged') return true;
    if (decision.kind === 'invalid') {
      showIssues([{ path: [rowId.startsWith('size') ? 'size' : 'position'], code: 'schema', message: `${decision.message}.` }]);
      return false;
    }
    return editGeometry(decision.request, decision.request.size ? 'resize' : 'move') !== 'refused';
  };

  const functionName = typeStatus.kind === 'registered' ? typeStatus.label : node.function;
  const areas = roomAreaView(node.id, design.doc, boundaryShiftsOf(design.doc, design.spatial));
  const fmtArea = (n: number) => `${Math.round(n * 100) / 100} m²`;
  const geometryAttributes = NODE_BUILT_IN_ATTRIBUTES.filter((a) => a.section === 'geometry');
  const schema = project?.attributes;
  const sourceOf = sourceResolver('nodes', active);
  const outsideCount = schema ? Object.keys(attributesOutsideSchema(schema, 'nodes', node.custom)).length : 0;
  const showCustom = schema ? schema.nodes.length > 0 || outsideCount > 0 : true;
  const manageLink = project && openAttributes ? <ManageAttributesLink onManage={() => openAttributes('nodes')} /> : undefined;

  return (
    <div className="sgl-panel">
      <div className="sgl-title">
        <span className="sgl-swatch" style={{ background: functionColour(node.function) }} aria-hidden="true" />
        {/* The Function names the room (2026-11-20); the id stays visible as its permanent identity. */}
        <span className="sgl-room-function">{functionName}</span>
        <span className="sgl-id" title="The node's id: permanent, never reused">
          Node <span className="sgl-room-label">{label}</span>
        </span>
      </div>

      <IssueFeedback issues={issues} context={context} onDismiss={clearIssues} />
      {pending && <RouteConfirm relationships={pending.relationships} action={pending.action} onCancel={cancelPending} onConfirm={confirmPending} />}

      <h3 className="sgl-attributes-heading">Attributes</h3>
      <div className="sgl-attr-sections" data-section="attributes">
        <AttributeSection section="identity">
          <FieldRow
            attributeId="id"
            kind="identity"
            label="ID"
            title="The node’s permanent number: never changes, never reused."
            control={<span className="sgl-field-value">{node.id}</span>}
            locked="Identity: cannot be changed"
          />
        </AttributeSection>

        <AttributeSection section="required" {...(!showCustom && manageLink && { actions: manageLink })}>
          <FieldRow
            attributeId="function"
            kind="required"
            label="Function"
            title="What the room is used for. Every node has one."
            control={
              /* Re-keyed on the stored value so the menu resets after any change (or undo). */
              <TypeSelect key={node.function} current={node.function} menu={menu} onChange={(functionId) => runShared({ type: 'set-node-type', nodeId, function: functionId })} />
            }
            meta={
              manageFunctions && (
                <button type="button" className="sgl-link" onClick={manageFunctions} title="Add or remove the functions this project offers">
                  Edit functions
                </button>
              )
            }
          >
            <TypeStatusNote status={typeStatus} functionId={node.function} projectId={active?.id ?? null} />
            <NodeChecks checks={checks} />
          </FieldRow>
        </AttributeSection>

        <AttributeSection section="geometry">
          {geometryAttributes.map((attribute) => {
            const part = attribute.id as 'position' | 'size';
            return (
              <FieldRow
                key={attribute.id}
                attributeId={attribute.id}
                kind="geometry"
                label={attribute.name}
                title={GEOMETRY_TITLES[part]}
                control={
                  <span className="sgl-axis-values" role="group" aria-label={`${attribute.name}: x, y, z`}>
                    {GEOMETRY_ROWS.filter((row) => row.part === part).map((row) => {
                      const stored = node[row.part][row.axis];
                      return (
                        <label key={row.id} className="sgl-axis-value" data-axis={row.id}>
                          <span className="sgl-axis-label">{row.label}</span>
                          <CommitInput key={`${row.id}:${stored}:${resetKey}`} label={row.name} type="number" stored={String(stored)} placeholder="" onCommit={commitGeometry(row.id, row.name)} />
                        </label>
                      );
                    })}
                  </span>
                }
              />
            );
          })}
          {/* Boundary shifts (2026-11-24): derived, read-only; never stored. */}
          {areas && (
            <>
              <FieldRow
                attributeId="areas"
                kind="geometry"
                label="Area"
                title="Nominal: the room's cells on the 3 m grid. Actual: as built, after an applied boundary shift (±1.5 m × the shared wall). Per storey."
                control={
                  <span className="sgl-field-value sgl-area-values">
                    <span data-area="nominal">Nominal {fmtArea(areas.nominal)}</span>
                    {' · '}
                    <span data-area="actual">Actual {fmtArea(areas.actual)}</span>
                  </span>
                }
                locked="Calculated from the design: read-only, not saved"
              />
              <FieldRow
                attributeId="boundaryAdjusted"
                kind="geometry"
                label="Boundary adjusted"
                title="Yes when the room takes part in an applied boundary shift (it gains or loses area). Calculated: a request that cannot be applied does not count."
                control={
                  <span className="sgl-field-value" data-boundary-adjusted={areas.adjusted ? 'yes' : 'no'}>
                    {areas.adjusted ? (
                      <>
                        Yes ({areas.role === 'grows' ? 'gains' : 'loses'} area,{' '}
                        <button type="button" className="sgl-link" onClick={() => props.onSelect(selectEdge(areas.edgeId!))} title="Show the edge whose boundary shift applies">
                          edge {areas.edgeId}
                        </button>
                        )
                      </>
                    ) : (
                      'No'
                    )}
                  </span>
                }
                locked="Calculated from the design: read-only, not saved"
              />
            </>
          )}
          <div className="sgl-help-row sgl-field-help">
            <span className="sgl-help">In cells, from the room’s lowest corner. Dragging its node in Graph 2D only tidies the diagram.</span>
            <HelpTip topicId="graph-vs-grid" />
            <HelpTip topicId="room-size" />
          </div>
        </AttributeSection>

        {showCustom && (
          <AttributeSection section="custom" {...(manageLink && { actions: manageLink })}>
            {project && schema ? (
              <CustomAttributes
                collection="nodes"
                item={node}
                schema={schema}
                run={runV2}
                onError={(message) => showIssues([{ path: ['custom'], code: 'schema', message }])}
                showHeader={false}
                sourceOf={sourceOf}
              />
            ) : specs ? (
              <>
                <TypedAttributesForm node={node} specs={specs} label={functionName} run={runShared} onLocalError={showIssues} />
                <AttributesForm key={`other:${JSON.stringify(node.custom)}`} node={node} specs={specs} run={runShared} onLocalError={showIssues} />
              </>
            ) : (
              <AttributesForm key={JSON.stringify(node.custom)} node={node} specs={null} run={runShared} onLocalError={showIssues} />
            )}
          </AttributeSection>
        )}

        <CalculatedRows design={design} collection="nodes" itemId={nodeId} />
      </div>

      <CollapsibleSection title="Edges" sectionId="relationships" defaultOpen={false} meta={String(incidentCount(props, nodeId))}>
        <RelationshipsV2 {...props} nodeId={nodeId} runV2={runV2} />
      </CollapsibleSection>

      <section className="sgl-section sgl-panel-actions">
        <button
          type="button"
          onClick={() => {
            const outcome = duplicateRoom(design, nodeId);
            if (!outcome.ok) return showIssues(outcome.issues);
            clearIssues();
            props.onSelect(selectNode(outcome.nodeId));
          }}
          title={`A copy with the same function, size and values in the closest free place; edges are not copied (Ctrl+D wherever a node is selected). ${UNDO_HINT}`}
        >
          Duplicate node
        </button>
        <button
          type="button"
          className="sgl-danger"
          onClick={() => runShared({ type: 'remove-node', nodeId })}
          title={`Also removes its ${incidentCount(props, nodeId)} edge(s) and its diagram position. ${UNDO_HINT}`}
        >
          Delete node
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
  const functionName = useFunctionName();
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
      {incident.length === 0 && <p className="meta">No edges yet.</p>}
      <ul className="sgl-list sgl-relations">
        {incident.map((e) => {
          const other = e.source === nodeId ? e.target : e.source;
          const resolution = design.spatial.byEdge.get(e.id);
          const status = resolution ? describeResolution(resolution) : null;
          return (
            <li key={e.id}>
              <button type="button" className="sgl-link" onClick={() => onSelect(selectEdge(e.id))} title="Show this edge">
                {labelOfChoice(RELATIONSHIP_KIND_CHOICES, e.relationship)}
              </button>{' '}
              with{' '}
              <button type="button" className="sgl-link" onClick={() => onSelect(selectNode(other))} title="Show this node">
                node {label(other)}
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
          <select value={target} aria-label="Node to connect to" onChange={(e) => setTarget(e.currentTarget.value)}>
            <option value="">Connect to node…</option>
            {candidates.map((n) => (
              <option key={n.id} value={n.id}>
                {nodeLabel(n)} ({functionName(n.function)})
              </option>
            ))}
          </select>
          <button type="button" disabled={target === ''} onClick={connect} title="Add an Access edge (you can change it to Open afterwards)">
            Connect
          </button>
        </div>
      )}
    </section>
  );
}

