import { defineFunction } from '@student-api';

/** The seed of the house: where you arrive. Invites a Living room and a Corridor. */
export default defineFunction({
  id: 'hall',
  label: 'Hall',
  colour: '#8e6bb8',
  facade: { windowFraction: 0.3 },
  custom: {
    targetArea: { kind: 'number', min: 1, default: 9 },
  },
});
