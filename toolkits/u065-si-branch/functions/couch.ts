import { defineFunction } from '@student-api';

/** Couch: the living area, a sofa and the space in front of it. Shared by everyone. */
export default defineFunction({
  id: 'couch',
  label: 'Couch',
  colour: '#e0a458',
  facade: { windowFraction: 0.5 },
  custom: {
    // A two-seat sofa (1.6 × 0.9 m), a side table and 1 m of free floor in front.
    minArea: { kind: 'number', min: 0, default: 5 },
    furniture: { kind: 'text', default: 'Two-seat sofa, side table' },
    needsPlumbing: { kind: 'boolean', default: false },
    privacy: { kind: 'enum', values: ['private', 'shared'], default: 'shared' },
    foldAway: { kind: 'boolean', default: false },
  },
});
