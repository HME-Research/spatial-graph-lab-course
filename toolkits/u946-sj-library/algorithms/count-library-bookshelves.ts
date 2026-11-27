import { defineDesignAnalysis } from '@student-api';

// Count shelves across the whole library.
export default defineDesignAnalysis({
  id: 'count-library-bookshelves',
  label: 'Count library bookshelves',
  inputs: [],
  uses: { functions: ['library-hall'], nodeFields: ['bookshelves'] },
  run(ctx) {
    // Add each hall's recorded count, treating missing values as zero.
    let total = 0;
    for (const room of ctx.design.nodes) {
      if (room.function !== 'library-hall') continue;
      const count = room.custom.bookshelves;
      if (typeof count === 'number') total += count;
    }
    // Show the total in Analyse.
    return { kind: 'analysis', value: total, text: `Bookshelves in library halls: ${total}.` };
  },
});
