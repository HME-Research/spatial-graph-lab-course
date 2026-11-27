import { defineDesignAnalysis } from '@student-api';

// Find candidates across the whole design without selecting a room.
export default defineDesignAnalysis({
  id: 'review-facade-placement',
  label: 'Find rooms for the street façade',
  description: 'Highlight rooms that need daylight and can tolerate exterior noise. The same rule applies to every function, regardless of current windows or position.',
  inputs: [],
  uses: {
    nodeFields: ['needsDaylight', 'canTolerateNoise'],
  },
  run(ctx) {
    // Include a room only when both values are explicitly true.
    const matchingRooms = ctx.design.nodes.filter((room) =>
      room.custom.needsDaylight === true && room.custom.canTolerateNoise === true,
    );

    // Highlight candidates only; the student decides where to place them.
    return {
      kind: 'analysis',
      text: matchingRooms.length === 0
        ? 'No candidates: both Needs daylight and Can tolerate noise must be Yes.'
        : 'Highlighted rooms need daylight and can tolerate noise. You decide their positions.',
      highlightNodes: matchingRooms.map((room) => room.id),
    };
  },
});
