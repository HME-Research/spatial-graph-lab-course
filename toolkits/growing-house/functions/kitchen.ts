import { defineFunction } from '@student-api';

/** Cooking, open to the dining room. Invites nothing. */
export default defineFunction({
  id: 'kitchen',
  label: 'Kitchen',
  colour: '#d4623b',
  facade: { windowFraction: 0.4 },
  custom: {
    targetArea: { kind: 'number', min: 1, default: 18 },
  },
});
