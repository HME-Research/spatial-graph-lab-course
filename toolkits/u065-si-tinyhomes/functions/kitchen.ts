import { defineFunction } from '@student-api';

/** Kitchen: a counter with sink and hob, and the aisle in front of it. A wet room that is shared. */
export default defineFunction({
  id: 'kitchen',
  label: 'Kitchen',
  colour: '#9bbf5a',
  facade: { windowFraction: 0.3 },
  custom: {
    // A 2.4 m counter (0.6 m deep) with a 1.2 m working aisle in front.
    minArea: { kind: 'number', min: 0, default: 4 },
    furniture: { kind: 'text', default: 'Counter 240 cm with sink, hob and fridge' },
    needsPlumbing: { kind: 'boolean', default: true },
    privacy: { kind: 'enum', values: ['private', 'shared'], default: 'shared' },
    foldAway: { kind: 'boolean', default: false },
  },
});
