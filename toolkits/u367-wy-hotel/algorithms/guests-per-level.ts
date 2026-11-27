import { defineDesignAnalysis } from '@student-api';

/**
 * Guests per level: a design analysis. It adds up the guests of all Guest rooms on each level
 * (a room counts on the level it starts on) and in the whole hotel, and colours each Guest room
 * by its number of guests. It takes no input, so it appears in Analyse › Network.
 */
export default defineDesignAnalysis({
  id: 'guests-per-level',
  label: 'Guests per level',
  description: 'Guests of all Guest rooms on each level and in the whole hotel; each Guest room is coloured by its number of guests.',
  inputs: [],
  uses: { functions: ['guest-room'], nodeFields: ['guests'] },
  run(ctx) {
    const perLevel: Record<number, number> = {};
    const perRoom: Record<number, number> = {};
    let total = 0;

    for (const room of ctx.design.nodes) {
      if (room.function !== 'guest-room') continue;
      // The room's guests; a missing value counts as 0.
      const guests = typeof room.custom.guests === 'number' ? room.custom.guests : 0;
      // Add them to the room's level (z of its position) and to the total.
      const level = room.position[2];
      perLevel[level] = (perLevel[level] ?? 0) + guests;
      perRoom[room.id] = guests;
      total += guests;
    }

    // One line: the guests of each level, lowest level first.
    const levels = Object.keys(perLevel).map(Number).sort((a, b) => a - b);
    const text =
      levels.length === 0
        ? 'No Guest room in this design.'
        : `${total} guests in total. ` + levels.map((l) => `Level ${l}: ${perLevel[l]}`).join(', ') + '.';

    return { kind: 'analysis', value: total, text, nodeValues: perRoom };
  },
});
