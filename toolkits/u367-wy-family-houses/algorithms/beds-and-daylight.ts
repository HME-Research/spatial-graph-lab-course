import { defineDesignAnalysis } from '@student-api';

/**
 * Beds and daylight: a design analysis (it reads the rooms themselves, not only the graph).
 * It takes no input, so it appears in Analyse › Network and looks at the whole house.
 *
 * - It counts the beds of every Bedroom on each level (a room counts on the level it starts on).
 * - It highlights every Living room, Kitchen or Bedroom that has no window.
 * - It colours each Bedroom by its number of beds.
 *
 * It names Function ids and reads two fields, so `uses` lists them.
 */
export default defineDesignAnalysis({
  id: 'beds-and-daylight',
  label: 'Beds and daylight',
  description: 'Counts the beds on each level and highlights every Living room, Kitchen or Bedroom without a window.',
  inputs: [],
  uses: { functions: ['living-room', 'kitchen', 'bedroom'], nodeFields: ['beds', 'hasWindow'] },
  run(ctx) {
    // The Functions whose rooms should have a window.
    const mainRooms = ['living-room', 'kitchen', 'bedroom'];

    const bedsPerLevel: Record<number, number> = {};
    const bedsPerRoom: Record<number, number> = {};
    const noWindow: number[] = [];
    let totalBeds = 0;

    for (const room of ctx.design.nodes) {
      // Count the beds of each Bedroom on its level (z of its position); a missing value counts as 0.
      if (room.function === 'bedroom') {
        const beds = typeof room.custom.beds === 'number' ? room.custom.beds : 0;
        const level = room.position[2];
        bedsPerLevel[level] = (bedsPerLevel[level] ?? 0) + beds;
        bedsPerRoom[room.id] = beds;
        totalBeds += beds;
      }
      // A main room without a window (no, or no answer) is highlighted.
      if (mainRooms.includes(room.function) && room.custom.hasWindow !== true) {
        noWindow.push(room.id);
      }
    }

    // No Bedroom at all: say so plainly.
    const levels = Object.keys(bedsPerLevel).map(Number).sort((a, b) => a - b);
    const bedsText =
      levels.length === 0
        ? 'No Bedroom yet'
        : levels.map((level) => `Level ${level}: ${bedsPerLevel[level]} bed(s)`).join(', ');

    // Which main rooms lack daylight.
    const daylightText =
      noWindow.length === 0
        ? 'every main room has a window.'
        : `${noWindow.length} main room(s) without a window (highlighted).`;

    return {
      kind: 'analysis',
      value: totalBeds,
      text: `${bedsText}; ${daylightText}`,
      highlightNodes: noWindow,
      nodeValues: bedsPerRoom,
    };
  },
});
