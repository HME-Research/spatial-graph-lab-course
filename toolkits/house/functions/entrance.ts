import { defineFunction } from '@student-api';

/** Where you arrive: a small hall with the front door. */
export default defineFunction({
  id: 'entrance',
  label: 'Entrance',
  facade: { windowFraction: 0.3 },
  custom: {
    targetArea: { kind: 'number', min: 1, default: 9 },
    priority: { kind: 'number', min: 1, default: 5 },
  },
});
