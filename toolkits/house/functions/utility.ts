import { defineFunction } from '@student-api';

/** Laundry and storage: few windows. */
export default defineFunction({
  id: 'utility',
  label: 'Utility',
  colour: '#8a8d2e',
  facade: { windowFraction: 0.1 },
  custom: {
    targetArea: { kind: 'number', min: 1, default: 9 },
    priority: { kind: 'number', min: 1, default: 11 },
  },
});
