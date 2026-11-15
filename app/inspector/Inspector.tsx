import { HelpTip } from '@app/ui/help';
import type { DesignDocument } from '@app/document';
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
 * Every edit is one command: a v1 `GraphCommand` through `onCommand`, or, when the schema-v2
 * port `design` is present, a `DesignCommand` through `design.onCommand` (moves and resizes are
 * previewed with `design.proposeEdit` first). A refused command leaves the document unchanged and
 * its reason is shown in plain language. v2-only controls (size, Access/Open, corridor style,
 * spatial status, corridor-clash confirmation) appear only when `design` is present.
 *
 * Props are the shared `InspectorProps` (= `ViewProps`); the export name `Inspector` is kept for
 * the current shell. `PropertiesPanel` is the same component under its new name.
 */
export function Inspector({ doc, selection, onSelect, onCommand, project, design }: InspectorProps) {
  const panel: PanelProps = { doc, design, project, onSelect, onCommand };
  const nodes = design ? design.doc.nodes : doc.nodes;
  const edges = design ? design.doc.edges : doc.edges;
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
          <DesignSummary doc={doc} design={design} />
        </div>
      )}
    </div>
  );
}

/** The same component under its Stage 05 name. */
export const PropertiesPanel = Inspector;

/** Shown when nothing is selected: what the open design contains. */
function DesignSummary({ doc, design }: { readonly doc: DesignDocument; readonly design: DesignPort | undefined }) {
  const metadata = design ? design.doc.metadata : doc.metadata;
  const nodes = design ? design.doc.nodes : doc.nodes;
  const storeys = [...new Set(nodes.map((n) => n.grid[2]))].sort((a, b) => a - b);
  const edgeCount = design ? design.doc.edges.length : doc.edges.length;
  const notBuilt = design ? design.spatial.edges.filter((r) => describeResolution(r).tone === 'warning').length : 0;
  return (
    <section className="sgl-section">
      <h4>Design</h4>
      <p className="sgl-design-name">{metadata.name}</p>
      {metadata.description && <p className="sgl-help">{metadata.description}</p>}
      <p className="sgl-help">
        {nodes.length} rooms · {edgeCount} relationships{notBuilt > 0 ? ` (${notBuilt} unresolved)` : ''} · storeys (z):{' '}
        {storeys.join(', ') || '—'} · schema v{design ? design.doc.schemaVersion : doc.schemaVersion}
      </p>
      <div className="sgl-help-row">
        <span className="sgl-help">
          Tip: moving a node in Graph 2D only rearranges the diagram. To move a room in the building, change its Position
          here.
        </span>
        <HelpTip topicId="graph-vs-grid" />
      </div>
      {design && (
        <div className="sgl-help-row">
          <span className="sgl-help">Relationship lines: solid = direct, long dashes = via route, short red dashes = unresolved.</span>
          <HelpTip topicId="relationship-status" />
        </div>
      )}
    </section>
  );
}
