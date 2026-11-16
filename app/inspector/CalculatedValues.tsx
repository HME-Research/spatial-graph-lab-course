import type { MetricEvaluator, MetricValue } from '@app/metrics/contracts';
import { createMetricEvaluator } from '@app/metrics/registry';
import type { DesignPort } from '@app/spatial';
import { CollapsibleSection, InfoButton } from '@app/ui';

/**
 * One shared evaluator for Properties. It only READS the root metric contract (`app/metrics`):
 * values are derived on demand, memoised per document, never written to the design and never
 * exported. Which metrics exist is decided by the registry (workstream M), not here.
 */
const PROPERTIES_EVALUATOR: MetricEvaluator = createMetricEvaluator();

/** A metric value as read-only text: rounded numbers with their unit, yes/no, or "—" for no value. */
export function formatMetricValue(value: MetricValue | null, unit?: string): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '—';
    const text = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
    return unit ? `${text} ${unit}` : text;
  }
  return value;
}

export interface CalculatedRow {
  readonly id: string;
  readonly label: string;
  readonly text: string;
}

/** Rows of every registered metric of the collection for one item (pure apart from the evaluator's cache). */
export function calculatedRows(
  design: Pick<DesignPort, 'doc' | 'spatial'>,
  collection: 'nodes' | 'edges',
  itemId: string,
  evaluator: MetricEvaluator = PROPERTIES_EVALUATOR,
): readonly CalculatedRow[] {
  const ctx = { doc: design.doc, spatial: design.spatial };
  return evaluator.metrics
    .filter((m) => m.collection === collection)
    .map((m) => ({ id: m.id, label: m.label, text: formatMetricValue(evaluator.value(ctx, m.id, itemId), m.unit) }));
}

/**
 * The read-only "Calculated" group of Properties: visually distinct from editable inputs (tinted
 * box, plain text values, a "read-only" marker), with the `i` concept dialog. Hidden when the
 * registry has no metric for this kind of item.
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
  const rows = calculatedRows(design, collection, itemId);
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
            <dt>{r.label}</dt>
            <dd>{r.text}</dd>
          </div>
        ))}
      </dl>
      <p className="sgl-calculated-note">Worked out from the design and updated automatically. Not editable, not saved.</p>
    </CollapsibleSection>
  );
}
