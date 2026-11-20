import { defineFunction } from '@student-api';

/** The dining room, between the kitchen and the garden. */
export default defineFunction({
  id: 'dining',
  label: 'Dining',
  colour: '#c2477d',
  facade: { windowFraction: 0.5 },
  custom: {
    targetArea: { kind: 'number', min: 1, default: 18 },
    priority: { kind: 'number', min: 1, default: 4 },
  },
});
