import { defineFunction } from '@student-api';

/** A bedroom: a double bedroom of 18 m² (two cells) by default. */
export default defineFunction({
  id: 'bedroom',
  label: 'Bedroom',
  facade: { windowFraction: 0.35 },
  custom: {
    targetArea: { kind: 'number', min: 1, default: 18 },
    priority: { kind: 'number', min: 1, default: 3 },
  },
});
