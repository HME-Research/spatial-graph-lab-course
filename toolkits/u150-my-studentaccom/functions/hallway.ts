import { defineFunction } from '@student-api';

/** Hallway: the circulation space between the Entrance and the Living room, with small windows. */
export default defineFunction({
  id: 'hallway',
  label: 'Hallway',
  colour: '#b9b4a6',
  facade: { windowFraction: 0.1 },
  custom: {
    beds: { kind: 'number', min: 0, default: 0 },
  },
});
