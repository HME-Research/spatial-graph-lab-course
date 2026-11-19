import { HelpTip } from '@app/ui/help';
import { connectorStyleOf, corridorStyleOf, nodeLabel, type ConnectorStyle, type RelationshipKind } from '@app/document';
import {
  CollapsibleSection,
  CONNECTOR_STYLE_CHOICES,
  labelOfChoice,
  InfoButton,
  describeResolution,
  Feedback,
  IssueFeedback,
  RELATIONSHIP_KIND_CHOICES,
  UNDO_HINT,
} from '@app/ui';
import { nodeTypeStatus } from '@app/views/project';
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
 * (id, source, target — locked), Required by the app (Relationship: Access / Open), Custom (tagged
 * by source), Calculated (locked). Edges have no Geometry section. Then how it is built.
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
    const status = nodeTypeStatus(active, n.typeId);
    return `${nodeLabel(n)} · ${status.kind === 'registered' ? status.label : n.typeId}`;
  };
  const resolution = design.spatial.byEdge.get(edge.id);
  const status = resolution ? describeResolution(resolution) : null;
  const style = connectorStyleOf(edge, design.doc.settings);
  // The design's corridor style (Building Designer → Corridors), used while the edge sets none.
  const designStyle = corridorStyleOf(design.doc.settings);
  const designDefaultLabel = `Design default (${labelOfChoice(CONNECTOR_STYLE_CHOICES, designStyle)})`;

  const setKind = (kind: RelationshipKind) => {
    if (kind !== edge.kind) runV2({ type: 'change-edge-kind', edgeId, kind });
  };
  // '' = Design default (removes the edge's own style); a style is stored as the edge's own.
  const setStyle = (next: ConnectorStyle | '') => {
    const stored = edge.connectorStyle ?? '';
    if (next !== stored) runV2({ type: 'set-connector-style', edgeId, style: next === '' ? null : next });
  };

  const schema = project?.attributes;
  const outsideCount = schema ? Object.keys(attributesOutsideSchema(schema, 'edges', edge.attributes)).length : 0;
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

        <AttributeSection section="required" {...(!showCustom && manageLink && { actions: manageLink })}>
          <FieldRow
            attributeId="relationship"
            kind="required"
            label="Relationship"
            title={RELATIONSHIP_KIND_CHOICES.find((c) => c.value === edge.kind)?.description ?? 'Access or Open.'}
            control={
              <div className="sgl-segmented" role="radiogroup" aria-label="Relationship kind">
                {RELATIONSHIP_KIND_CHOICES.map((c) => (
                  <label key={c.value} className={edge.kind === c.value ? 'checked' : undefined} title={c.description}>
                    <input type="radio" name={`kind-${edgeId}`} value={c.value} checked={edge.kind === c.value} onChange={() => setKind(c.value)} />
                    {c.label}
                  </label>
                ))}
              </div>
            }
            meta={<InfoButton concept="access-open" />}
          />
        </AttributeSection>

        {showCustom && schema && (
          <AttributeSection section="custom" {...(manageLink && { actions: manageLink })}>
            <CustomAttributes
              collection="edges"
              item={edge}
              schema={schema}
              run={runV2}
              onError={(message) => showIssues([{ path: ['attributes'], code: 'schema', message }])}
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

        {resolution?.status === 'routed' ? (
          <fieldset className="sgl-section">
            <legend>Corridor style</legend>
            <HelpTip topicId="connector-style" />
            <select value={edge.connectorStyle ?? ''} aria-label="Corridor style" onChange={(e) => setStyle(e.currentTarget.value as ConnectorStyle | '')}>
              <option value="" title="The corridor style of the whole design (Building Designer → Corridors)">
                {designDefaultLabel}
              </option>
              {CONNECTOR_STYLE_CHOICES.map((c) => (
                <option key={c.value} value={c.value} title={c.description}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="sgl-help">
              {CONNECTOR_STYLE_CHOICES.find((c) => c.value === style)?.description}
              {edge.connectorStyle === undefined ? ' Change it for the whole design in Building Designer → Corridors.' : ' Set for this relationship only.'}
            </p>
          </fieldset>
        ) : (
          edge.connectorStyle !== undefined && (
            <p className="sgl-help">
              Corridor style “{CONNECTOR_STYLE_CHOICES.find((c) => c.value === edge.connectorStyle)?.label}” is stored. It is
              used only when a corridor is generated.
            </p>
          )
        )}
      </CollapsibleSection>

      <RemoveConnection onRemove={() => runShared({ type: 'remove-edge', edgeId })} />
      <StoredData record={edge} />
    </div>
  );
}
