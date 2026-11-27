import { defineFunction } from '@student-api';

/** Bedroom: a double bed with space to walk around it. Private: nobody should walk through it. */
export default defineFunction({
  id: 'bedroom',
  label: 'Bedroom',
  colour: '#6f8fc9',
  facade: { windowFraction: 0.3 },
  custom: {
    // Bed 1.4 × 2 m plus a 0.6 m strip on three sides and a small wardrobe.
    minArea: { kind: 'number', min: 0, default: 7 },
    furniture: { kind: 'text', default: 'Double bed 140 × 200 cm, wardrobe' },
    needsPlumbing: { kind: 'boolean', default: false },
    privacy: { kind: 'enum', values: ['private', 'shared'], default: 'private' },
    foldAway: { kind: 'boolean', default: false },
  },
});
