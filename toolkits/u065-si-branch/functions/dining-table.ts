import { defineFunction } from '@student-api';

/** Dining table: a table for two with chairs. Its drop-leaf table folds away. */
export default defineFunction({
  id: 'dining-table',
  label: 'Dining table',
  colour: '#c97b5a',
  facade: { windowFraction: 0.4 },
  custom: {
    // A 0.8 × 0.8 m table, two chairs and the space to pull them out.
    minArea: { kind: 'number', min: 0, default: 3 },
    furniture: { kind: 'text', default: 'Drop-leaf table for two, two chairs' },
    needsPlumbing: { kind: 'boolean', default: false },
    privacy: { kind: 'enum', values: ['private', 'shared'], default: 'shared' },
    foldAway: { kind: 'boolean', default: true },
  },
});
