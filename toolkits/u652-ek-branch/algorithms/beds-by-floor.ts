import { defineDesignAnalysis } from '@student-api';
import { bedroomFunctionIds } from '../lib/bedrooms';

/** Adds recorded bedroom bed counts by level and reports the total. */
export default defineDesignAnalysis({
  id: 'beds-by-floor',
  label: 'Beds by floor',
  description: 'Counts the recorded number of beds on each level and shows the total.',
  inputs: [],
  uses: {
    functions: bedroomFunctionIds,
    nodeFields: ['bedCount'],
  },
  run(ctx) {
    // Start each drawn level at zero, including levels without bedrooms.
    const bedsByLevel: Record<number, number> = {};
    for (const room of ctx.design.nodes) bedsByLevel[room.position[2]] = 0;
    const bedroomIds: number[] = [];
    let totalBeds = 0;
    let missingCounts = 0;

    // Collect each bedroom's recorded beds at its storey level.
    for (const room of ctx.design.nodes) {
      if (!bedroomFunctionIds.includes(room.function)) continue;
      bedroomIds.push(room.id);
      const beds = room.custom.bedCount;
      if (typeof beds !== 'number') {
        missingCounts += 1;
        continue;
      }
      const level = room.position[2];
      bedsByLevel[level] = (bedsByLevel[level] ?? 0) + beds;
      totalBeds += beds;
    }

    // Describe the floor totals in ascending level order.
    const floors = Object.keys(bedsByLevel)
      .map(Number)
      .sort((a, b) => a - b)
      .map((level) => `${level === 0 ? 'Ground floor' : `Level ${level}`}: ${bedsByLevel[level]} bed(s)`);

    // Explain empty designs and any bedrooms without a recorded bed count.
    let text: string;
    if (bedroomIds.length === 0) {
      text = 'No bedrooms have been added yet.';
    } else if (missingCounts === bedroomIds.length) {
      text = `No bed counts are recorded for the ${bedroomIds.length} bedroom(s).`;
    } else {
      text = `${floors.join('; ')}. Total: ${totalBeds} bed(s).`;
      if (missingCounts > 0) text += ` ${missingCounts} bedroom(s) have no recorded bed count.`;
    }

    return {
      kind: 'analysis',
      value: totalBeds,
      text,
      highlightNodes: bedroomIds,
    };
  },
});
