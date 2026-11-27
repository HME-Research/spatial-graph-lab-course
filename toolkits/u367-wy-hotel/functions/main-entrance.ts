import { defineFunction } from '@student-api';

/** The main entrance: where guests arrive. */
export default defineFunction({
  id: 'main-entrance',
  label: 'Main entrance',
  colour: '#e0a43a',
  facade: { windowFraction: 0.5 },
  custom: {
    // It counts as an escape exit unless you say otherwise.
    countsAsExit: { kind: 'boolean', default: true },
  },
});
