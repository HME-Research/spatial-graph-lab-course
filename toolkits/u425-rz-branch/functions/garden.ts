import { defineFunction } from '@student-api';

/** A garden: an open planted area. The front and rear gardens are about 100 m² each. */
export default defineFunction({
  id: 'garden',
  label: 'Garden',
  colour: '#4f8f3a',
  facade: { windowFraction: 0 },
  custom: {
    targetArea: { kind: 'number', min: 1, default: 100 },
    petFriendly: { kind: 'boolean', default: true },
  },
});
