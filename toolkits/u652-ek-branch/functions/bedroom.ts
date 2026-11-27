import { defineFunction } from '@student-api';

/** A regular bedroom, with one bed by default. */
export default defineFunction({
  id: 'bedroom',
  label: 'Bedroom',
  colour: '#4f78a8',
  facade: { windowFraction: 0.35 },
  custom: {
    bedCount: { kind: 'number', min: 1, max: 2, default: 1 },
  },
});
