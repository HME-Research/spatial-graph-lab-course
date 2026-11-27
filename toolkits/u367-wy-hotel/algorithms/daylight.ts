import { defineDesignAnalysis } from '@student-api';

/**
 * Daylight: a design analysis. A Guest room passes if it has an outside window and its window area
 * is at least 1/N of its floor area (N = 7 by default). It shows each Guest room's ratio
 * (window area ÷ floor area) and highlights the rooms that fail.
 *
 * N is a number input (analyses have no parameters), so it appears in Analyse › Queries.
 */
export default defineDesignAnalysis({
  id: 'daylight',
  label: 'Daylight',
  description: 'A Guest room passes with an outside window of at least 1/N of its floor area (N = 7). Failing rooms light up; every room shows its ratio.',
  inputs: [{ kind: 'number', label: 'N (window ≥ floor area ÷ N)', min: 1, default: 7 }],
  uses: { functions: ['guest-room'], nodeFields: ['windowArea', 'hasOutsideWindow'] },
  run(ctx) {
    const n = ctx.inputs[0] ?? 7;
    const ratios: Record<number, number> = {};
    const failing: number[] = [];
    let guestRooms = 0;

    for (const room of ctx.design.nodes) {
      if (room.function !== 'guest-room') continue;
      guestRooms++;
      // The floor area the app calculates (m²).
      const area = ctx.metrics.value('area', room.id);
      if (typeof area !== 'number' || area <= 0) continue;
      // The window area; a missing value counts as no window.
      const window = typeof room.custom.windowArea === 'number' ? room.custom.windowArea : 0;
      // Window area ÷ floor area, shown on the room.
      const ratio = window / area;
      ratios[room.id] = Math.round(ratio * 1000) / 1000;
      // It fails without an outside window or with too little glass.
      if (room.custom.hasOutsideWindow !== true || ratio < 1 / n) failing.push(room.id);
    }

    // Explain the answer in one line.
    let text: string;
    if (guestRooms === 0) text = 'No Guest room in this design.';
    else if (failing.length === 0) text = `Every Guest room has an outside window of at least 1/${n} of its floor area.`;
    else text = `${failing.length} of ${guestRooms} Guest room(s) fail (no outside window, or window area below 1/${n} of the floor area).`;

    return { kind: 'analysis', value: failing.length, text, highlightNodes: failing, nodeValues: ratios };
  },
});
