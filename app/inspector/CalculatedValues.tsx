import type { ReactNode } from 'react';
import { metricRows } from '@app/metrics';
import type { DesignPort } from '@app/spatial';
import { useEnabledMetrics } from '@app/views/three/enabledMetrics';
import { selectEdge, selectNode } from '@core/viewer/selection';

/**
 * One row of the unified attribute list in Properties (same order and kinds as the Attributes
 * panel: required, then custom, then calculated): the name on the left, the value or its control on
 * the right, and an optional muted line below (source, actions).
 */
export function FieldRow({
  attributeId,
  kind,
  label,
  title,
  htmlFor,
  control,
  meta,
  metricId,
  children,
}: {
  readonly attributeId: string;
  readonly kind: 'required' | 'custom' | 'calculated';
  readonly label: ReactNode;
  readonly title?: string;
  readonly htmlFor?: string;
  readonly control: ReactNode;
  readonly meta?: ReactNode;
  readonly metricId?: string;
  /** Full-width notes under the row (warnings, checks). */
  readonly children?: ReactNode;
}) {
  const Label = htmlFor === undefined ? 'span' : 'label';
  return (
    <div className={`sgl-field sgl-field-${kind}`} data-attribute={attributeId} data-attribute-kind={kind} data-metric={metricId}>
      <Label className="sgl-field-label" title={title} {...(htmlFor !== undefined && { htmlFor })}>
        {label}
      </Label>
      <div className="sgl-field-control">{control}</div>
      {meta !== undefined && meta !== null && meta !== false && <div className="sgl-field-meta">{meta}</div>}
      {children}
    </div>
  );
}

/**
 * The calculated attributes of one node or edge, as read-only rows of the attribute list: plain
 * text values (never inputs), marked "calculated". Only the values the project has enabled
 * (`settings.calculatedFields`, chosen in Attributes), in catalogue order, derived on read from the
 * live document and its preference-aware resolution, so a geometry or edge change refreshes them.
 * Never written to the design, never exported.
 */
export function CalculatedRows({
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
  return (
    <>
      {rows.map((r) => (
        <FieldRow
          key={r.id}
          attributeId={r.id}
          metricId={r.id}
          kind="calculated"
          label={r.label}
          title={r.definition ? `${r.definition}\nCalculated from the design: read-only, not saved.` : 'Calculated from the design: read-only, not saved.'}
          control={<span className="sgl-field-value">{r.text}</span>}
          meta="calculated"
        />
      ))}
    </>
  );
}
