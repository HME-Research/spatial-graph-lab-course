import { HelpTip } from '@app/ui/help';
import { corridorLookOf, designCorridorLook, nodeLabel, type RelationshipKind } from '@app/document';
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
import { useContext } from 'react';
import { AttributeSection } from '@app/attributes/AttributeSection';
import { sourceResolver } from '@app/attributes/attributeSources';
import { CustomAttributes, ManageAttributesLink } from '@app/attributes/CustomAttributes';
import { OpenAttributesContext } from '@app/attributes/navigation';
import { attributesOutsideSchema } from '@app/extensions';
import { StoredData } from './AttributeEditors';
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
      <button type="button" className="sgl-danger" onClick={onRemove} title={`The two rooms stay where they are. ${UNDO_HINT}`}>
        Remove connection
      </button>
    </section>
  );
}

const ENDPOINT_LOCK = 'Identity: an edge always joins the same two nodes. To join others, add another edge.';

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
  const ownCount = (own.walls === undefined ? 0 : 1) + (own.roof === undefined ? 0 : 1);

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
        <option value="" title="The Corridors card of the whole design (Building Designer → Looks)">
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

  const endpointRow = (attributeId: 'source' | 'target', name: string, nodeId: number) => (
    <FieldRow
      attributeId={attributeId}
      kind="identity"
      label={name}
      title={attributeId === 'source' ? 'The node the edge starts from.' : 'The node the edge leads to.'}
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
        Relationship {label(edge.source)} ↔ {label(edge.target)}
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
          {endpointRow('target', 'Target', edge.target)}
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
          <FieldRow
            attributeId="corridor"
            kind="geometry"
            label="Corridor"
            title="This relationship’s own corridor look, walls and roof. Used only when a corridor is generated; Design default follows the Corridors card (Building Designer → Looks)."
            control={
              <div className="sgl-corridor">
                {corridorField('walls', 'Walls', CORRIDOR_WALL_CHOICES, designLook.walls)}
                {corridorField('roof', 'Roof', CORRIDOR_ROOF_CHOICES, designLook.roof)}
              </div>
            }
            meta={<HelpTip topicId="connector-style" />}
          >
            <p className="sgl-help">
              {resolution?.status === 'routed'
                ? `This corridor: ${corridorLookText(look)}. `
                : `No corridor is generated for this relationship now${resolution?.status === 'direct' ? ' (its rooms touch)' : ''}; these values are used only if one is. `}
              {ownCount === 0
                ? 'Change every corridor with the Corridors card in Building Designer → Looks.'
                : `${ownCount === 2 ? 'Both are' : 'One is'} set for this relationship only; Design default follows the Corridors card.`}
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
                title="Unresolved: nothing can be built yet. The relationship is kept."
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
