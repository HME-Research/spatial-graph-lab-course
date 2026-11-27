import { defineDesignAnalysis } from '@student-api';
import { formatArea, LARGEST_HOME, rateSize, SMALLEST_HOME } from '../lib/sizing';

/**
 * Space efficiency: a design analysis (it reads the rooms themselves, not only the graph).
 *
 * For every room it compares the floor area as built (`actual-area`, which includes boundary
 * shifts) with the room's `minArea` (its own value, else its Function's default). A room is
 * undersized (smaller than its minimum), efficient (up to 1.5 × its minimum) or oversized
 * (more: wasted floor). Rooms are coloured by that rating; undersized and oversized rooms are
 * highlighted. The big number is the share of the floor that is really needed (%).
 */
export default defineDesignAnalysis({
  id: 'space-efficiency',
  label: 'Space efficiency',
  description: 'Rates every room as undersized, efficient or oversized by comparing its floor area with its minimum area, and shows how much floor is wasted.',
  inputs: [],
  uses: { nodeFields: ['minArea'] },
  run(ctx) {
    // Nothing to rate in an empty design.
    if (ctx.design.nodes.length === 0) {
      return { kind: 'analysis', text: 'No rooms yet: draw rooms with the Tiny homes Functions, then run this again.' };
    }

    // Function labels, for the text ("Bedroom 1").
    const labels = new Map(ctx.functions.map((f) => [f.id, f.label]));
    const name = (id: number, fn: string) => `${labels.get(fn) ?? fn} ${id}`;

    const ratings: Record<number, string> = {};
    const undersized: string[] = [];
    const oversized: string[] = [];
    const highlight: number[] = [];
    let efficient = 0;
    let totalArea = 0;
    let neededArea = 0;
    let wasted = 0;

    for (const room of ctx.design.nodes) {
      // The floor area as built (m²); fall back to the nominal area.
      const actual = ctx.metrics.value('actual-area', room.id);
      const nominal = ctx.metrics.value('area', room.id);
      const area = typeof actual === 'number' ? actual : typeof nominal === 'number' ? nominal : 0;
      totalArea += area;

      // The room's minimum area; a room without one is not rated.
      const minArea = room.custom.minArea;
      if (typeof minArea !== 'number' || minArea <= 0) continue;

      // Rate it and remember what it needs and what it wastes.
      const rating = rateSize(area, minArea);
      ratings[room.id] = rating;
      neededArea += Math.min(area, minArea);
      if (rating === 'undersized') {
        undersized.push(`${name(room.id, room.function)} (${formatArea(area)} of ${formatArea(minArea)} m²)`);
        highlight.push(room.id);
      } else if (rating === 'oversized') {
        wasted += area - minArea;
        oversized.push(`${name(room.id, room.function)} (+${formatArea(area - minArea)} m²)`);
        highlight.push(room.id);
      } else {
        efficient++;
      }
    }

    // The share of the floor that the rooms really need (%).
    const share = totalArea > 0 ? Math.round((neededArea / totalArea) * 100) : 0;

    // Are all rooms together in the tiny-home range (for a design of one home)?
    const range = totalArea < SMALLEST_HOME || totalArea > LARGEST_HOME ? 'outside' : 'within';
    const parts = [`All rooms together ${formatArea(totalArea)} m² (${range} the tiny-home range ${SMALLEST_HOME}–${LARGEST_HOME} m²), ${share}% of it needed.`];
    if (undersized.length > 0) parts.push(`Undersized: ${undersized.join(', ')}.`);
    if (oversized.length > 0) parts.push(`Oversized: ${oversized.join(', ')}; ${formatArea(wasted)} m² could be saved or shared.`);
    parts.push(`${efficient} efficient.`);

    return {
      kind: 'analysis',
      value: share,
      text: parts.join(' '),
      highlightNodes: highlight,
      nodeValues: ratings,
    };
  },
});
