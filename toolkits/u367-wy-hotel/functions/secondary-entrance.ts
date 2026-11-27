import { defineFunction } from '@student-api';

/** A secondary entrance: a side or service door. */
export default defineFunction({
  id: 'secondary-entrance',
  label: 'Secondary entrance',
  colour: '#c98b2b',
  facade: { windowFraction: 0.2 },
  custom: {
    // It counts as an escape exit unless you say otherwise.
    countsAsExit: { kind: 'boolean', default: true },
  },
});
