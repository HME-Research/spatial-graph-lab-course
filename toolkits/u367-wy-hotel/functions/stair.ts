import { defineFunction } from '@student-api';

/** A stair that joins the levels. */
export default defineFunction({
  id: 'stair',
  label: 'Stair',
  colour: '#56606e',
  facade: { windowFraction: 0.2 },
  custom: {
    // It is an escape stair unless you say otherwise.
    isEscapeStair: { kind: 'boolean', default: true },
  },
});
