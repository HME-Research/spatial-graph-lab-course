import { defineDesignAnalysis } from '@student-api';

/** Highlight rooms whose longest horizontal side is no longer than 6 m. */
export default defineDesignAnalysis({
  id: 'rooms-max-6m',
  label: 'Rooms no longer than 6 m',
  description: 'Highlights rooms whose longest horizontal side is at most 6 m, using the built-in 3 m grid.',
  inputs: [],
  run(ctx) {
    // Collect the ids of rooms whose longest horizontal side is within the limit.
    const compactRooms = ctx.design.nodes
      .filter((room) => Math.max(room.size[0], room.size[1]) * 3 <= 6)
      .map((room) => room.id);

    // Explain the result and highlight every matching room.
    return {
      kind: 'analysis',
      value: compactRooms.length,
      text: compactRooms.length === 0
        ? 'No rooms have a longest horizontal side of 6 m or less.'
        : `${compactRooms.length} room(s) have a longest horizontal side of 6 m or less.`,
      highlightNodes: compactRooms,
    };
  },
});
