import { defineFunction } from '@student-api';

/** Corridors, landings and stairs that join the other rooms. */
export default defineFunction({
  id: 'circulation',
  label: 'Circulation',
  facade: { windowFraction: 0.2 },
  custom: {
    targetArea: { kind: 'number', min: 1, default: 9 },
    priority: { kind: 'number', min: 1, default: 6 },
  },
});
