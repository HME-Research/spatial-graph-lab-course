import { defineFunction } from '@student-api';

/** A kitchen: where meals are made, around 12 m² by default. */
export default defineFunction({
  id: 'kitchen',
  label: 'Kitchen',
  colour: '#e8a33d',
  facade: { windowFraction: 0.4 },
  custom: {
    targetArea: { kind: 'number', min: 1, default: 12 },
    petFriendly: { kind: 'boolean', default: false },
  },
});
