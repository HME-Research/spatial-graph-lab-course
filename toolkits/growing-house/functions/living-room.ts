import { defineFunction } from '@student-api';

/** The main day room, with large windows. Invites a Dining room and a Terrace. */
export default defineFunction({
  id: 'living-room',
  label: 'Living room',
  colour: '#e8a33d',
  facade: { windowFraction: 0.6 },
  custom: {
    targetArea: { kind: 'number', min: 1, default: 27 },
  },
});
