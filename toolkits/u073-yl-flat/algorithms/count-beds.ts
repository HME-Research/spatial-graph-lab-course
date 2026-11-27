import { defineDesignAnalysis } from '@student-api';

// Count beds across all bedrooms, so the analysis needs no selected room.
export default defineDesignAnalysis({
  id: 'count-beds',
  label: 'Count beds',
  description: 'Total number of beds in the bedrooms of the flat.',
  inputs: [],
  uses: { functions: ['bedroom'], nodeFields: ['beds'] },
  run(ctx) {
    // Add each bedroom's bed count. A missing value contributes zero.
    let total = 0;
    for (const room of ctx.design.nodes) {
      if (room.function !== 'bedroom') continue;
      const beds = room.custom.beds;
      if (typeof beds === 'number') total += beds;
    }

    // Show the total for the whole flat.
    return { kind: 'analysis', value: total, text: `Total beds in the flat: ${total}.` };
  },
});
