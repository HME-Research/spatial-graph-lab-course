import { defineFunction } from '@student-api';

/** The living room: the main day room of the family. */
export default defineFunction({
  id: 'living-room',
  label: 'Living room',
  colour: '#6aa84f',
  facade: { windowFraction: 0.5 },
  custom: {
    // A Living room has a window unless you say otherwise.
    hasWindow: { kind: 'boolean', default: true },
  },
});
