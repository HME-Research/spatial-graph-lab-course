import { HelpTip } from '@app/ui/help';
import type { DesignPort } from '@app/spatial';
import type { InspectorProps } from '@app/views/contracts';
import { describeResolution } from '@app/ui';
import { EdgeProperties } from './EdgeProperties';
import { NodeProperties } from './NodeProperties';
import type { PanelProps } from './panelSupport';
import './inspector.css';

/**
 * Properties panel (Stage 05; formerly "Inspector") for the single selected room or relationship.
 *
 * Every edit is one `DesignCommand` through `design.onCommand` (moves and resizes are previewed
 * with `design.proposeEdit` first). A refused command leaves the document unchanged and its reason
 * is shown in plain language.
 *
 * Props are the shared `InspectorProps` (= `ViewProps`); the export name `Inspector` is kept for
 * the current shell. `PropertiesPanel` is the same component under its new name.
 */
export function Inspector({ selection, onSelect, project, design }: InspectorProps) {
  const panel: PanelProps = { design, project, onSelect };
  const { nodes, edges } = design.doc;
  const nodeId = selection.kind === 'node' && nodes.some((n) => n.id === selection.id) ? selection.id : null;
  const edgeId = selection.kind === 'edge' && edges.some((e) => e.id === selection.id) ? selection.id : null;
  return (
    <div className="inspector sgl-inspector sgl-properties">
      {nodeId !== null ? (
        <NodeProperties key={`node:${nodeId}`} {...panel} nodeId={nodeId} />
      ) : edgeId !== null ? (
        <EdgeProperties key={`edge:${edgeId}`} {...panel} edgeId={edgeId} />
      ) : (
        <div className="sgl-panel">
          <p className="sgl-empty">Select a room or a relationship in any view to see and edit its properties here.</p>
          <DesignSummary design={design} />
        </div>
      )}
    </div>
  );
}

/** The same component under its Stage 05 name. */
export const PropertiesPanel = Inspector;

/** Shown when nothing is selected: what the open design contains. */
function DesignSummary({ design }: { readonly design: DesignPort }) {
  const { metadata, nodes } = design.doc;
  const storeys = [...new Set(nodes.map((n) => n.position[2]))].sort((a, b) => a - b);
  const edgeCount = design.doc.edges.length;
  const notBuilt = design.spatial.edges.filter((r) => describeResolution(r).tone === 'warning').length;
  return (
    <section className="sgl-section">
      <h4>This scenario</h4>
      {metadata.description && <p className="sgl-help">{metadata.description}</p>}
      <p className="sgl-help" title={`Stored as schema v${design.doc.schemaVersion}`}>
        {nodes.length} {nodes.length === 1 ? 'node' : 'nodes'} · {edgeCount} {edgeCount === 1 ? 'edge' : 'edges'}
        {notBuilt > 0 ? ` (${notBuilt} unresolved)` : ''} · levels: {storeys.join(', ') || '—'}
      </p>
      <div className="sgl-help-row">
        <span className="sgl-help">Relationship lines: solid = direct, long dashes = via route, short red dashes = unresolved.</span>
        <HelpTip topicId="relationship-status" />
      </div>
    </section>
  );
}
