import { metricRows } from '@app/metrics';
import type { DesignPort } from '@app/spatial';
import { CollapsibleSection, InfoButton } from '@app/ui';
import { useEnabledMetrics } from '@app/views/three/enabledMetrics';
import { selectEdge, selectNode } from '@core/viewer/selection';

/**
 * The read-only "Calculated" group of Properties: visually distinct from editable inputs (tinted
 * box, plain text values, a "read-only" marker), with the `i` concept dialog.
 *
 * Content comes from workstream M (`metricRows` with the shared `defaultMetricEvaluator` and
 * `formatMetricValue`): only the calculated values the project has enabled
 * (`settings.calculatedFields`, chosen in Attributes), in catalogue order, derived on read from the
 * live document and its preference-aware resolution — so a geometry or edge change refreshes them.
 * Never written to the design, never exported. Function and Level are system fields, not metrics,
 * and are shown with the room's identity instead. Hidden when nothing is enabled for this kind of item.
 */
export function CalculatedValues({
  design,
  collection,
  itemId,
}: {
  readonly design: Pick<DesignPort, 'doc' | 'spatial'>;
  readonly collection: 'nodes' | 'edges';
  readonly itemId: string;
}) {
  const enabled = useEnabledMetrics();
  const selection = collection === 'nodes' ? selectNode(itemId) : selectEdge(itemId);
  const rows = metricRows(selection, { doc: design.doc, spatial: design.spatial }, enabled);
  if (rows.length === 0) return null;
  return (
    <CollapsibleSection
      title="Calculated"
      meta={<span className="sgl-chip sgl-chip-readonly">read-only</span>}
      variant="calculated"
      className="sgl-calculated"
      sectionId="calculated"
      actions={<InfoButton concept="calculated-values" />}
    >
      <dl className="sgl-readonly-list" aria-label="Calculated values (read-only)">
        {rows.map((r) => (
          <div key={r.id} style={{ display: 'contents' }} data-metric={r.id}>
            <dt title={r.definition || undefined}>{r.label}</dt>
            <dd>{r.text}</dd>
          </div>
        ))}
      </dl>
      <p className="sgl-calculated-note">Worked out from the design and updated automatically. Not editable, not saved.</p>
    </CollapsibleSection>
  );
}
