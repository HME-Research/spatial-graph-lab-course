import { defineFunction } from '@student-api';

/** Circulation: space to move through, with small windows and nobody counted in it. */
export default defineFunction({
  id: 'circulation',
  label: 'Circulation',
  colour: '#9b9a8f',
  facade: { windowFraction: 0.1 },
  custom: {
    occupancy: { kind: 'number', min: 0, default: 0 },
  },
});
