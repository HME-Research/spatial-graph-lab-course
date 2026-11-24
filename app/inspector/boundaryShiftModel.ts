import { actualArea, BOUNDARY_SHIFT_STATUS_TEXT, nominalArea, type BoundaryShiftOutcome, type BoundaryShiftResolution } from '@app/building';
import { BOUNDARY_SHIFT_DISTANCE, type BoundaryShift, type DesignDocumentV2 } from '@app/document';
import { DEFAULT_CELL_SIZE } from '@core/viewer/coordinates';

/**
 * What Properties shows for boundary shifts (2026-11-24). Pure. The stored REQUEST is edited; the
 * applied state and its reason are derived (`resolveBoundaryShifts`), never stored.
 */

export interface BoundaryShiftChoice {
  readonly value: BoundaryShift;
  readonly label: string;
  /** Disabled: the two rooms can never take a shift (stacked, or different storeys). `none` never is. */
  readonly disabled: boolean;
  readonly title: string;
}

const CELL = DEFAULT_CELL_SIZE.horizontal;
const m = (n: number) => `${Math.round(n * 100) / 100}`;

/** The three choices of an edge. `source` / `target` name the rooms (e.g. "3 · Bathroom"). */
export function boundaryShiftChoices(outcome: Pick<BoundaryShiftOutcome, 'blocked'> | undefined, source: string, target: string): BoundaryShiftChoice[] {
  const blocked = outcome?.blocked;
  const why = blocked ? `${BOUNDARY_SHIFT_STATUS_TEXT[blocked]}. Choose No shift to clear a stored request.` : undefined;
  return [
    { value: 'none', label: 'No shift', disabled: false, title: 'Keep the shared wall on the grid line (nominal).' },
    {
      value: 'toward-source',
      label: 'Toward source',
      disabled: blocked !== undefined,
      title: why ?? `Move the shared wall ${m(BOUNDARY_SHIFT_DISTANCE)} m into the source (${source}): it loses area, the target (${target}) gains it.`,
    },
    {
      value: 'toward-target',
      label: 'Toward target',
      disabled: blocked !== undefined,
      title: why ?? `Move the shared wall ${m(BOUNDARY_SHIFT_DISTANCE)} m into the target (${target}): it loses area, the source (${source}) gains it.`,
    },
  ];
}

export interface BoundaryShiftStatusView {
  readonly tone: 'none' | 'applied' | 'not-applied';
  /** Short status ("Applied", "Not applied"). */
  readonly title: string;
  /** One plain sentence: the effect, or why the request is not applied. */
  readonly detail: string;
}

/** How an edge's request currently stands. */
export function boundaryShiftStatusView(
  outcome: BoundaryShiftOutcome | undefined,
  doc: Pick<DesignDocumentV2, 'nodes'>,
  shifts: BoundaryShiftResolution,
): BoundaryShiftStatusView {
  if (!outcome || outcome.status === 'no-request') {
    return { tone: 'none', title: 'No shift requested', detail: 'The shared wall stays on the grid line.' };
  }
  if (outcome.status !== 'applied') {
    // The chip says "Not possible" / "Not applied"; the sentence gives the reason only.
    const reason = outcome.message.replace(/^Not (applied|possible): /, '');
    return {
      tone: 'not-applied',
      title: outcome.blocked ? 'Not possible' : 'Not applied',
      detail: `${reason.charAt(0).toUpperCase()}${reason.slice(1)} The request is kept.`,
    };
  }
  const area = (id: number | undefined) => {
    const n = doc.nodes.find((x) => x.id === id);
    return n ? `room ${n.id}: ${m(nominalArea(n, CELL))} → ${m(actualArea(n, doc, shifts, CELL))} m²` : '';
  };
  return { tone: 'applied', title: 'Applied', detail: `The wall moves ${m(BOUNDARY_SHIFT_DISTANCE)} m: ${area(outcome.shrinking)}; ${area(outcome.growing)}.` };
}

/** Node Properties: nominal and actual area and whether the room is boundary-adjusted. */
export function roomAreaView(nodeId: number, doc: Pick<DesignDocumentV2, 'nodes'>, shifts: BoundaryShiftResolution) {
  const node = doc.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  const shift = shifts.byNode.get(nodeId);
  return {
    nominal: nominalArea(node, CELL),
    actual: actualArea(node, doc, shifts, CELL),
    adjusted: shift !== undefined,
    /** The applied shift's edge, when adjusted. */
    edgeId: shift?.edgeId,
    role: shift === undefined ? undefined : shift.shrinking === nodeId ? ('shrinks' as const) : ('grows' as const),
  };
}
