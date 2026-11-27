import { defineFunction } from '@student-api';

/** Living room: the shared lounge where the students meet, with large windows. */
export default defineFunction({
  id: 'living-room',
  label: 'Living room',
  colour: '#e8a33d',
  facade: { windowFraction: 0.6 },
  custom: {
    beds: { kind: 'number', min: 0, default: 0 },
  },
});
