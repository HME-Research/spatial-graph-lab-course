import type { DesignCommand, UnresolvedReason } from '@app/spatial';
import type { DiagramModel } from './diagramModel';
import { RELATIONSHIP_KIND_LABELS, UNRESOLVED_REASON_TEXT } from './edgePresentation';

/**
 * "Remove invalid connections" (wave 2, D). Pure. An invalid connection is a relationship whose
 * derived spatial status is `unresolved` (it is still valid graph data; the student may remove it
 * explicitly). Nothing here mutates anything: the view shows the rows, the student unchecks what
 * to keep, and ONE `remove-edges` command removes the rest (one undo step). Never automatic.
 */

export interface InvalidConnectionRow {
  readonly edgeId: string;
  /** "01 ↔ 04": the rooms' readable labels (never the raw edge id). */
  readonly label: string;
  /** "Access" / "Open". */
  readonly kindLabel: string;
  readonly reason: UnresolvedReason;
  /** Beginner explanation of why the relationship cannot be built. */
  readonly reasonText: string;
}

/** The unresolved relationships of a schema-v2 model, in document order. A v1 model has none. */
export function invalidConnectionRows(model: DiagramModel): readonly InvalidConnectionRow[] {
  if (model.version !== 2) return [];
  const label = (id: string) => model.byNode.get(id)?.label ?? id;
  const rows: InvalidConnectionRow[] = [];
  for (const edge of model.edges) {
    const r = edge.resolution;
    if (r?.status !== 'unresolved') continue;
    rows.push({
      edgeId: edge.id,
      label: `${label(edge.source)} ↔ ${label(edge.target)}`,
      kindLabel: RELATIONSHIP_KIND_LABELS[edge.kind as 'access' | 'open'] ?? String(edge.kind),
      reason: r.reason,
      reasonText: UNRESOLVED_REASON_TEXT[r.reason] ?? r.message,
    });
  }
  return rows;
}

/** Ids that will be removed: every CURRENT row that the student did not uncheck (rows are checked by default). */
export function checkedEdgeIds(rows: readonly InvalidConnectionRow[], unchecked: ReadonlySet<string>): readonly string[] {
  return rows.filter((r) => !unchecked.has(r.edgeId)).map((r) => r.edgeId);
}

/** The one command for the checked rows, or null when nothing is checked. */
export function removeInvalidCommand(rows: readonly InvalidConnectionRow[], unchecked: ReadonlySet<string>): DesignCommand | null {
  const edgeIds = checkedEdgeIds(rows, unchecked);
  return edgeIds.length === 0 ? null : { type: 'remove-edges', edgeIds };
}

/** Why the action is not offered (explicit, never a silent no-op). */
export const NO_INVALID_CONNECTIONS =
  'There are no invalid connections: every relationship is built directly or by a connector.';

/** Short confirmation summary, e.g. "Remove 2 of 3 invalid connections; 1 is kept." */
export function removeSummary(total: number, checked: number): string {
  if (checked === 0) return 'Nothing is selected: check the connections to remove.';
  const kept = total - checked;
  const s = (n: number) => (n === 1 ? '' : 's');
  return `Remove ${checked} of ${total} invalid connection${s(total)}${kept > 0 ? `; ${kept} ${kept === 1 ? 'is' : 'are'} kept` : ''}. One undo step restores them.`;
}
