import { defineFunction } from '@student-api';

/** A planted garden court: open to the sky, no glass of its own. */
export default defineFunction({
  id: 'garden',
  label: 'Garden',
  colour: '#4f8f3a',
  facade: { windowFraction: 0 },
  custom: {
    targetArea: { kind: 'number', min: 1, default: 36 },
    priority: { kind: 'number', min: 1, default: 8 },
  },
});
