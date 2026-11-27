import { defineFunction } from '@student-api';

/** Entrance: the front door of the flat, a small lobby that opens into the Hallway. */
export default defineFunction({
  id: 'entrance',
  label: 'Entrance',
  colour: '#c96fa8',
  facade: { windowFraction: 0.3 },
  custom: {
    beds: { kind: 'number', min: 0, default: 0 },
  },
});
