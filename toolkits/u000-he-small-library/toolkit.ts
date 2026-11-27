import { defineToolkit } from '@student-api';

/** Give every room the same fields; Functions below provide their own defaults. */
export default defineToolkit({
  name: 'HE Small Library',
  defaultDesign: 'acoustic-library',
  custom: {
    nodes: {
      noise: {
        kind: 'enum',
        values: ['loud', 'medium', 'quiet'],
        label: 'Noise level',
        description: 'Intended acoustic character of a room.',
      },
      seats: {
        kind: 'number', min: 0, default: 0,
        label: 'Seats', description: 'Number of reader or visitor seats.',
      },
      shelves: {
        kind: 'number', min: 0, default: 0,
        label: 'Number of shelves', description: 'Count of book shelves.',
      },
    },
  },
});
