import { defineFunction } from '@student-api';

/** Washroom: shower, toilet and basin. A private wet room with small windows. */
export default defineFunction({
  id: 'washroom',
  label: 'Washroom',
  colour: '#5fb3b3',
  facade: { windowFraction: 0.1 },
  custom: {
    // A 0.8 × 0.8 m shower, a toilet, a basin and the space to use them.
    minArea: { kind: 'number', min: 0, default: 3.5 },
    furniture: { kind: 'text', default: 'Shower 80 × 80 cm, toilet, basin' },
    needsPlumbing: { kind: 'boolean', default: true },
    privacy: { kind: 'enum', values: ['private', 'shared'], default: 'private' },
    foldAway: { kind: 'boolean', default: false },
  },
});
