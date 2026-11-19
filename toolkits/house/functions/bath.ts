import { defineFunction } from '@student-api';

/** Bathroom: small windows for privacy. */
export default defineFunction({
  id: 'bath',
  label: 'Bath',
  facade: { windowFraction: 0.15 },
  custom: {
    targetArea: { kind: 'number', min: 1, default: 9 },
    priority: { kind: 'number', min: 1, default: 4 },
  },
});
