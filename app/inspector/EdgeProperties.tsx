import { HelpTip } from '@app/ui/help';
import { connectorStyleOf, nodeLabel, type ConnectorStyle, type RelationshipKind } from '@app/document/v2';
import { formatGrid } from '@app/views/graph2d/diagram';
import {
  CollapsibleSection,
  CONNECTOR_STYLE_CHOICES,
  InfoButton,
  describeResolution,
  Feedback,
  IssueFeedback,
  RELATIONSHIP_KIND_CHOICES,
  UNDO_HINT,
} from '@app/ui';
import { selectNode } from '@core/viewer/selection';
import { useContext } from 'react';
import { CustomAttributes, ManageAttributesLink } from '@app/attributes/CustomAttributes';
import { OpenAttributesContext } from '@app/attributes/navigation';
import { StoredData } from './AttributeEditors';
import { CalculatedRows, FieldRow } from './CalculatedValues';
import { messageContextFor, useCommands, type PanelProps } from './panelSupport';

/** Properties of one relationship. v2 (with the design port): Access/Open, status, connector. */
export function EdgeProperties(props: PanelProps & { readonly edgeId: string }) {
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

function EdgePropertiesV2(props: PanelProps & { readonly edgeId: string }) {
  const { design, onSelect, edgeId, project } = props;
  const { issues, clearIssues, showIssues, runShared, runV2 } = useCommands(props);
  const openAttributes = useContext(OpenAttributesContext);
  const edge = design?.doc.edges.find((e) => e.id === edgeId);
  if (!design || !edge) return null;
  const rooms = [edge.source, edge.target].map((id) => design.doc.nodes.find((n) => n.id === id));
  const label = (id: string) => {
    const n = design.doc.nodes.find((x) => x.id === id);
    return n ? nodeLabel(n) : id;
  };
  const resolution = design.spatial.byEdge.get(edge.id);
  const status = resolution ? describeResolution(resolution) : null;
  const style = connectorStyleOf(edge);
  const kindChoice = RELATIONSHIP_KIND_CHOICES.find((c) => c.value === edge.kind);

  const setKind = (kind: RelationshipKind) => {
    if (kind !== edge.kind) runV2({ type: 'change-edge-kind', edgeId, kind });
  };
  // `style` already includes the default, so choosing the effective value sends nothing.
  const setStyle = (next: ConnectorStyle) => {
    if (next !== style) runV2({ type: 'set-connector-style', edgeId, style: next });
  };

  const relationshipRow = (
    <FieldRow
      attributeId="relationship"
      kind="required"
      label="Relationship"
      title={kindChoice?.description ?? 'Access or Open.'}
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
  );
  const calculatedRows = <CalculatedRows design={design} collection="edges" itemId={edgeId} />;

  return (
    <div className="sgl-panel">
      <div className="sgl-title">
        Relationship {label(edge.source)} ↔ {label(edge.target)}
      </div>

      <IssueFeedback issues={issues} context={messageContextFor(props)} onDismiss={clearIssues} />

      <CollapsibleSection
        title="Attributes"
        sectionId="attributes"
        defaultOpen={false}
        meta={kindChoice?.label}
        actions={project && openAttributes ? <ManageAttributesLink onManage={() => openAttributes('edges')} /> : undefined}
      >
        {project ? (
          <CustomAttributes
            collection="edges"
            item={edge}
            schema={project.attributes}
            run={runV2}
            onError={(message) => showIssues([{ path: ['attributes'], code: 'schema', message }])}
            showHeader={false}
            before={relationshipRow}
            after={calculatedRows}
            {...(openAttributes && { onManage: () => openAttributes('edges') })}
          />
        ) : (
          <section className="sgl-section sgl-custom-attributes" aria-label="Attributes">
            {relationshipRow}
            {calculatedRows}
          </section>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Connects" sectionId="connects" defaultOpen={false} meta={`${label(edge.source)} ↔ ${label(edge.target)}`}>
        <ul className="sgl-list">
          {rooms.map(
            (n, i) =>
              n && (
                <li key={i}>
                  <button type="button" className="sgl-link" onClick={() => onSelect(selectNode(n.id))} title="Show this room">
                    room {nodeLabel(n)}
                  </button>{' '}
                  <span className="meta">
                    {n.typeId} · at {formatGrid(n.grid)}
                  </span>
                </li>
              ),
          )}
        </ul>
      </CollapsibleSection>

      <CollapsibleSection title="Geometry" sectionId="geometry" defaultOpen={false} meta={status?.title}>
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
            <select value={style} aria-label="Corridor style" onChange={(e) => setStyle(e.currentTarget.value as ConnectorStyle)}>
              {CONNECTOR_STYLE_CHOICES.map((c) => (
                <option key={c.value} value={c.value} title={c.description}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="sgl-help">{CONNECTOR_STYLE_CHOICES.find((c) => c.value === style)?.description}</p>
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
