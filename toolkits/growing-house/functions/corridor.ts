import { defineFunction } from '@student-api';

/** The private wing's corridor. Invites two Bedrooms and a Bathroom. */
export default defineFunction({
  id: 'corridor',
  label: 'Corridor',
  colour: '#9b9a8f',
  facade: { windowFraction: 0.2 },
  custom: {
    targetArea: { kind: 'number', min: 1, default: 9 },
  },
});
