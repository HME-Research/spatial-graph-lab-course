import { defineFunction } from '@student-api';

/** A bedroom: four of them, each around 12 m² by default. */
export default defineFunction({
  id: 'bedroom',
  label: 'Bedroom',
  colour: '#4f7cc0',
  facade: { windowFraction: 0.35 },
  custom: {
    targetArea: { kind: 'number', min: 1, default: 12 },
    petFriendly: { kind: 'boolean', default: false },
  },
});
