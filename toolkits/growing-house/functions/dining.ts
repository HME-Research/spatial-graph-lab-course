import { defineFunction } from '@student-api';

/** Eating, between the living room and the kitchen. Invites a Kitchen. */
export default defineFunction({
  id: 'dining',
  label: 'Dining',
  colour: '#c2477d',
  facade: { windowFraction: 0.5 },
  custom: {
    targetArea: { kind: 'number', min: 1, default: 18 },
  },
});
