import { defineFunction } from '@student-api';

/** A bedroom: where the family sleeps, with 0 to 4 beds. */
export default defineFunction({
  id: 'bedroom',
  label: 'Bedroom',
  colour: '#4f7cc0',
  facade: { windowFraction: 0.35 },
  custom: {
    // One bed unless you say otherwise ("Beds from area" can set it for you).
    beds: { kind: 'number', min: 0, max: 4, default: 1 },
    // A Bedroom has a window unless you say otherwise.
    hasWindow: { kind: 'boolean', default: true },
  },
});
