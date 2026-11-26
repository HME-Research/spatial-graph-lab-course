import { defineFunction } from '@student-api';

/** A bathroom: small windows for privacy. Invites nothing. */
export default defineFunction({
  id: 'bathroom',
  label: 'Bathroom',
  colour: '#3fa9b5',
  facade: { windowFraction: 0.15 },
  custom: {
    targetArea: { kind: 'number', min: 1, default: 9 },
  },
});
