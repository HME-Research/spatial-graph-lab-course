import { defineFunction } from '@student-api';

/** A study: a quiet room for reading and work, around 9 m² by default. */
export default defineFunction({
  id: 'study',
  label: 'Study',
  colour: '#8b5e3c',
  facade: { windowFraction: 0.4 },
  custom: {
    targetArea: { kind: 'number', min: 1, default: 9 },
    petFriendly: { kind: 'boolean', default: false },
  },
});
