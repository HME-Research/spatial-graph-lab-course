import { HelpTip } from '@app/ui/help';
import { boundaryShiftsOf } from '@app/building';
import { boundaryShiftOf, CORRIDOR_WIDTH_STEP, corridorLookOf, designCorridorLook, formatCorridorWidth, MAX_CORRIDOR_WIDTH, nodeLabel, parseCorridorWidth, type RelationshipKind } from '@app/document';
import {
  CollapsibleSection,
  CORRIDOR_ROOF_CHOICES,
  CORRIDOR_WALL_CHOICES,
  corridorLookText,
  labelOfChoice,
  InfoButton,
  describeResolution,
  Feedback,
  IssueFeedback,
  RELATIONSHIP_KIND_CHOICES,
  UNDO_HINT,
  type Choice,
} from '@app/ui';
import { functionStatus } from '@app/views/project';
import { selectNode } from '@core/viewer/selection';
import { useContext, useEffect, useState, type ReactNode } from 'react';
import { AttributeSection } from '@app/attributes/AttributeSection';
import { sourceResolver } from '@app/attributes/attributeSources';
import { CustomAttributes, ManageAttributesLink } from '@app/attributes/CustomAttributes';
import { OpenAttributesContext } from '@app/attributes/navigation';
import { attributesOutsideSchema } from '@app/extensions';
import { StoredData } from './AttributeEditors';
import { boundaryShiftChoices, boundaryShiftStatusView } from './boundaryShiftModel';
import { CalculatedRows, FieldRow } from './CalculatedValues';
import { messageContextFor, useCommands, type PanelProps } from './panelSupport';

/**
 * Properties of one relationship, in the attribute sections (Programme P4, `sections.ts`): Identity
 * (id, source, target — locked), Required by the app (Relationship: Access / Open), Geometry
 * (Corridor: walls | roof, always editable like the Data table; used only when a corridor is
 * generated), Custom (tagged by source), Calculated (locked). Then how it is built.
 */
export function EdgeProperties(props: PanelProps & { readonly edgeId: number }) {
  return <EdgePropertiesV2 {...props} />;
}

function RemoveConnection({ onRemove }: { readonly onRemove: () => void }) {
  return (
    <section className="sgl-section sgl-panel-actions">
      <button type="button" className="sgl-danger" onClick={onRemove} title={`The two nodes stay where they are. ${UNDO_HINT}`}>
        Delete edge
      </button>
    </section>
  );
}

/**
 * This relationship's own corridor width (m): a number box whose empty state is "Design default
 * (<card width>)"; Enter or leaving it sends one `set-edge-corridor` (empty = clear the own value).
 */
function CorridorWidthField({ edgeId, own, designWidth, onWidth, onInvalid }: {
  readonly edgeId: number;
  readonly own: number | undefined;
  readonly designWidth: number;
  readonly onWidth: (width: number | null) => void;
  readonly onInvalid: (message: string) => void;
}) {
  const shown = own === undefined ? '' : String(own);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  const id = `sgl-edge-${edgeId}-corridor-width`;
  const commit = () => {
    if (text.trim() === shown) return;
    const parsed = parseCorridorWidth(text);
    if (!parsed.ok) {
      onInvalid(parsed.message);
      setText(shown);
      return;
    }
    onWidth(parsed.width);
  };
  return (
    <div className="sgl-corridor-field">
      <label htmlFor={id}>Width (m)</label>
      <span className="sgl-corridor-width">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={CORRIDOR_WIDTH_STEP}
          max={MAX_CORRIDOR_WIDTH}
          step={CORRIDOR_WIDTH_STEP}
          aria-label="Corridor width"
          placeholder={`Design default (${formatCorridorWidth(designWidth)})`}
          title={`Built width in metres, centred in the corridor's cells (more than 0, at most ${formatCorridorWidth(MAX_CORRIDOR_WIDTH)}). Empty: Design default (${formatCorridorWidth(designWidth)}).`}
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') setText(shown);
          }}
          onBlur={commit}
        />
        {own !== undefined && (
          <button type="button" className="sgl-link" title={`Use the design default (${formatCorridorWidth(designWidth)})`} aria-label="Use the design default width" onClick={() => onWidth(null)}>
            ↺
          </button>
        )}
      </span>
    </div>
  );
}

const ENDPOINT_LOCK = 'Identity: an edge always joins the same two nodes (Reverse swaps which is the source). To join others, add another edge.';

const REVERSE_TITLE =
  'Swap source and target: the same edge (same id and values). Its door then swings into the other room, and a requested boundary shift keeps its value, so the wall moves into the other room.';

function EdgePropertiesV2(props: PanelProps & { readonly edgeId: number }) {
  const { design, onSelect, edgeId, project } = props;
  const { issues, clearIssues, showIssues, runShared, runV2 } = useCommands(props);
  const openAttributes = useContext(OpenAttributesContext);
  const edge = design?.doc.edges.find((e) => e.id === edgeId);
  if (!design || !edge) return null;
  const active = project?.project ?? null;
  const label = (id: number) => {
    const n = design.doc.nodes.find((x) => x.id === id);
    return n ? nodeLabel(n) : id;
  };
  /** "3 · Kitchen": the node's id and its function. */
  const endpointText = (id: number): string => {
    const n = design.doc.nodes.find((x) => x.id === id);
    if (!n) return String(id);
    const status = functionStatus(active, n.function);
    return `${nodeLabel(n)} · ${status.kind === 'registered' ? status.label : n.function}`;
  };
  const resolution = design.spatial.byEdge.get(edge.id);
  const status = resolution ? describeResolution(resolution) : null;
  // Each corridor field: this relationship's own value → the design's Corridors card → built-in.
  const look = corridorLookOf(edge, design.doc.settings);
  const designLook = designCorridorLook(design.doc.settings);
  const own = edge.corridor ?? {};
  const ownCount = (own.walls === undefined ? 0 : 1) + (own.roof === undefined ? 0 : 1) + (own.width === undefined ? 0 : 1);

  const shifts = boundaryShiftsOf(design.doc, design.spatial);
  const shiftOutcome = shifts.byEdge.get(edge.id);
  const requestedShift = boundaryShiftOf(edge);
  const shiftChoices = boundaryShiftChoices(shiftOutcome, endpointText(edge.source), endpointText(edge.target));
  const shiftStatus = boundaryShiftStatusView(shiftOutcome, design.doc, shifts);

  const setKind = (kind: RelationshipKind) => {
    if (kind !== edge.relationship) runV2({ type: 'change-edge-kind', edgeId, relationship: kind });
  };
  // '' = Design default (clears this relationship's own value); a value is stored as its own.
  const setCorridor = (field: 'walls' | 'roof', next: string) => {
    if (next === (own[field] ?? '')) return;
    runV2({ type: 'set-edge-corridor', edgeId, patch: { [field]: next === '' ? null : next } });
  };
  const corridorField = <T extends string>(field: 'walls' | 'roof', title: string, choices: readonly Choice<T>[], designValue: T) => (
    <div className="sgl-corridor-field">
      <label htmlFor={`sgl-edge-${edgeId}-corridor-${field}`}>{title}</label>
      <select
        id={`sgl-edge-${edgeId}-corridor-${field}`}
        value={own[field] ?? ''}
        aria-label={`Corridor ${field}`}
        onChange={(e) => setCorridor(field, e.currentTarget.value)}
      >
        <option value="" title="The Corridors card of the whole design (Building Designer → Corridors)">
          Design default ({labelOfChoice(choices, designValue)})
        </option>
        {choices.map((c) => (
          <option key={c.value} value={c.value} title={c.description}>
            {c.label}
          </option>
        ))}
      </select>
    </div>
  );

  const schema = project?.attributes;
  const outsideCount = schema ? Object.keys(attributesOutsideSchema(schema, 'edges', edge.custom)).length : 0;
  const showCustom = schema !== undefined && (schema.edges.length > 0 || outsideCount > 0);
  const manageLink = project && openAttributes ? <ManageAttributesLink onManage={() => openAttributes('edges')} /> : undefined;

  const endpointRow = (attributeId: 'source' | 'target', name: string, nodeId: number, meta?: ReactNode) => (
    <FieldRow
      attributeId={attributeId}
      kind="identity"
      label={name}
      title={attributeId === 'source' ? 'The node the edge starts from.' : 'The node the edge leads to: its door swings into this room.'}
      {...(meta !== undefined && { meta })}
      control={
        <button type="button" className="sgl-link sgl-field-value" onClick={() => onSelect(selectNode(nodeId))} title="Show this node">
          {endpointText(nodeId)}
        </button>
      }
      locked={ENDPOINT_LOCK}
    />
  );

  return (
    <div className="sgl-panel">
      <div className="sgl-title">
        Edge {label(edge.source)} ↔ {label(edge.target)}
      </div>

      <IssueFeedback issues={issues} context={messageContextFor(props)} onDismiss={clearIssues} />

      <div className="sgl-attr-sections" data-section="attributes">
        <AttributeSection section="identity">
          <FieldRow
            attributeId="id"
            kind="identity"
            label="ID"
            title="The edge’s permanent number: never changes, never reused."
            control={<span className="sgl-field-value">{edge.id}</span>}
            locked="Identity: cannot be changed"
          />
          {endpointRow('source', 'Source', edge.source)}
          {endpointRow('target', 'Target', edge.target, (
            <button type="button" className="sgl-link sgl-reverse-edge" onClick={() => runV2({ type: 'reverse-edge', edgeId })} title={REVERSE_TITLE}>
              ⇄ Reverse source and target
            </button>
          ))}
        </AttributeSection>

        <AttributeSection section="required">
          <FieldRow
            attributeId="relationship"
            kind="required"
            label="Relationship"
            title={RELATIONSHIP_KIND_CHOICES.find((c) => c.value === edge.relationship)?.description ?? 'Access or Open.'}
            control={
              <div className="sgl-segmented" role="radiogroup" aria-label="Relationship kind">
                {RELATIONSHIP_KIND_CHOICES.map((c) => (
                  <label key={c.value} className={edge.relationship === c.value ? 'checked' : undefined} title={c.description}>
                    <input type="radio" name={`kind-${edgeId}`} value={c.value} checked={edge.relationship === c.value} onChange={() => setKind(c.value)} />
                    {c.label}
                  </label>
                ))}
              </div>
            }
            meta={<InfoButton concept="access-open" />}
          />
        </AttributeSection>

        <AttributeSection section="geometry" {...(!showCustom && manageLink && { actions: manageLink })}>
          {/* Boundary shift (2026-11-24): the stored request; applied or not is derived. */}
          <FieldRow
            attributeId="boundaryShift"
            kind="geometry"
            label="Boundary shift"
            title="A request to move the shared wall 1.5 m into the source or the target room. Kept even when it cannot be applied; the grid, positions and sizes never change."
            control={
              <div className="sgl-segmented sgl-segmented-3" role="radiogroup" aria-label="Boundary shift">
                {shiftChoices.map((c) => (
                  <label
                    key={c.value}
                    className={[requestedShift === c.value ? 'checked' : '', c.disabled ? 'disabled' : ''].filter(Boolean).join(' ') || undefined}
                    title={c.title}
                    data-shift={c.value}
                  >
                    <input
                      type="radio"
                      name={`shift-${edgeId}`}
                      value={c.value}
                      checked={requestedShift === c.value}
                      disabled={c.disabled}
                      onChange={() => {
                        if (c.value !== requestedShift) runV2({ type: 'set-edges-boundary-shift', edgeIds: [edgeId], boundaryShift: c.value });
                      }}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            }
          >
            <p className="sgl-help sgl-shift-status" data-shift-status={shiftOutcome?.status ?? 'no-request'}>
              <span className={`sgl-chip ${shiftStatus.tone === 'applied' ? 'sgl-chip-ok' : shiftStatus.tone === 'not-applied' ? 'sgl-chip-warning' : 'sgl-chip-readonly'}`}>{shiftStatus.title}</span>{' '}
              {shiftStatus.detail}
            </p>
          </FieldRow>
        </AttributeSection>

        {/* The corridor generated when the rooms do not touch: its own section (owner 2026-11-24). */}
        <AttributeSection section="corridor">
          <FieldRow
            attributeId="corridor"
            kind="geometry"
            label="Look"
            title="This edge’s own corridor: walls, roof and width. Used only when a corridor is generated; Design default follows the Corridors card (Building Designer → Corridors)."
            control={
              <div className="sgl-corridor">
                {corridorField('walls', 'Walls', CORRIDOR_WALL_CHOICES, designLook.walls)}
                {corridorField('roof', 'Roof', CORRIDOR_ROOF_CHOICES, designLook.roof)}
                <CorridorWidthField
                  edgeId={edgeId}
                  own={own.width}
                  designWidth={designLook.width}
                  onWidth={(width) => {
                    if (width !== (own.width ?? null)) runV2({ type: 'set-edge-corridor', edgeId, patch: { width } });
                  }}
                  onInvalid={(message) => showIssues([{ path: ['corridor', 'width'], code: 'schema', message }])}
                />
              </div>
            }
            meta={<HelpTip topicId="connector-style" />}
          >
            <p className="sgl-help">
              {resolution?.status === 'routed'
                ? `This corridor: ${corridorLookText(look)}. `
                : `No corridor is generated for this edge now${resolution?.status === 'direct' ? ' (its rooms touch)' : ''}; these values are used only if one is. `}
              {ownCount === 0
                ? 'Change every corridor with the Corridors card in Building Designer → Corridors.'
                : `${ownCount === 1 ? 'One is' : ownCount === 2 ? 'Two are' : 'All three are'} set for this edge only; Design default follows the Corridors card.`}
            </p>
          </FieldRow>
        </AttributeSection>

        {showCustom && schema && (
          <AttributeSection section="custom" {...(manageLink && { actions: manageLink })}>
            <CustomAttributes
              collection="edges"
              item={edge}
              schema={schema}
              run={runV2}
              onError={(message) => showIssues([{ path: ['custom'], code: 'schema', message }])}
              showHeader={false}
              sourceOf={sourceResolver('edges', active)}
            />
          </AttributeSection>
        )}

        <CalculatedRows design={design} collection="edges" itemId={edgeId} />
      </div>

      <CollapsibleSection title="In the building" sectionId="edge-building" defaultOpen={false} meta={status?.title}>
        <section className="sgl-section" aria-live="polite">
          <div className="sgl-help-row">
            <h4>In the building</h4> <HelpTip topicId={resolution?.status === 'unresolved' ? 'unresolved' : 'relationship-status'} />
          </div>
          {status && resolution ? (
            status.tone === 'warning' && resolution.status === 'unresolved' ? (
              <Feedback
                tone="warning"
                title="Unresolved: nothing can be built yet. The edge is kept."
                messages={[{ text: status.detail, technical: `${resolution.reason} · ${resolution.message}` }]}
              />
            ) : (
              <p className="sgl-status">
                <span className="sgl-chip sgl-chip-ok">{status.title}</span> {status.detail}
              </p>
            )
          ) : (
            <p className="meta">No spatial status available.</p>
          )}
        </section>

      </CollapsibleSection>

      <RemoveConnection onRemove={() => runShared({ type: 'remove-edge', edgeId })} />
      <StoredData record={edge} />
    </div>
  );
}
