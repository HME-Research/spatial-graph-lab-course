import { defineFunction } from '@student-api';

/** Dining kitchen: the shared kitchen with a dining table for everyone in the flat. */
export default defineFunction({
  id: 'dining-kitchen',
  label: 'Dining kitchen',
  colour: '#d9694a',
  facade: { windowFraction: 0.5 },
  custom: {
    beds: { kind: 'number', min: 0, default: 0 },
  },
});
