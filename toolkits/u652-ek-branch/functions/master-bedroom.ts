import { defineFunction } from '@student-api';

/** The main bedroom, with one bed by default. */
export default defineFunction({
  id: 'master-bedroom',
  label: 'Master bedroom',
  colour: '#355a7a',
  facade: { windowFraction: 0.35 },
  custom: {
    bedCount: { kind: 'number', min: 1, max: 2, default: 1 },
  },
});
