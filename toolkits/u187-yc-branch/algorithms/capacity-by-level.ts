import { defineDesignAnalysis } from '@student-api';

// Compare shared capacity with beds on each room's starting level.
export default defineDesignAnalysis({
  id: 'capacity-by-level',
  label: 'Capacity by level',
  description: 'Counts beds, kitchen seats, living room seats and workspace desks by starting level, with each shared capacity per bed.',
  inputs: [],
  uses: {
    functions: ['bedroom', 'shared-kitchen', 'communal-living-room', 'shared-workspace'],
    nodeFields: ['beds', 'seats', 'desks'],
  },
  run(ctx) {
    // Start a separate count for every level containing a room.
    const levels = new Map<number, { beds: number; kitchen: number; living: number; desks: number }>();
    for (const room of ctx.design.nodes) {
      const level = room.position[2];
      const counts = levels.get(level) ?? { beds: 0, kitchen: 0, living: 0, desks: 0 };
      levels.set(level, counts);

      // Count only the capacity relevant to this Function; missing values count as zero.
      const { beds, seats, desks } = room.custom;
      if (room.function === 'bedroom' && typeof beds === 'number') counts.beds += beds;
      if (room.function === 'shared-kitchen' && typeof seats === 'number') counts.kitchen += seats;
      if (room.function === 'communal-living-room' && typeof seats === 'number') counts.living += seats;
      if (room.function === 'shared-workspace' && typeof desks === 'number') counts.desks += desks;
    }

    // Show levels in order, without dividing by zero on a level with no beds.
    const lines = [...levels.entries()].sort(([a], [b]) => a - b).map(([level, counts]) => {
      const perBed = (capacity: number) => counts.beds > 0 ? (capacity / counts.beds).toFixed(2) : 'N/A (no beds)';
      return `Level ${level}: ${counts.beds} beds; kitchen seats ${counts.kitchen} (${perBed(counts.kitchen)} per bed); living room seats ${counts.living} (${perBed(counts.living)} per bed); workspace desks ${counts.desks} (${perBed(counts.desks)} per bed).`;
    });
    return { kind: 'analysis', text: lines.length ? lines.join('\n') : 'No rooms yet. Draw rooms to compare capacity by level.' };
  },
});
