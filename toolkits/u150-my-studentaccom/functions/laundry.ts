import { defineFunction } from '@student-api';

/** Laundry: a shared room for washing machines and dryers, with small windows. */
export default defineFunction({
  id: 'laundry',
  label: 'Laundry',
  colour: '#9b9a8f',
  facade: { windowFraction: 0.1 },
  custom: {
    beds: { kind: 'number', min: 0, default: 0 },
  },
});
