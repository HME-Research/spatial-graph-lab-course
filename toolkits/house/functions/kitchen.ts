import { defineFunction } from '@student-api';

/** Cooking and eating, open to the living room. */
export default defineFunction({
  id: 'kitchen',
  label: 'Kitchen',
  colour: '#d4623b',
  facade: { windowFraction: 0.4 },
  custom: {
    targetArea: { kind: 'number', min: 1, default: 18 },
    priority: { kind: 'number', min: 1, default: 2 },
  },
});
