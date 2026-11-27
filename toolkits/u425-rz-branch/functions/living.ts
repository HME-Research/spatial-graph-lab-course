import { defineFunction } from '@student-api';

/** A living room: the main shared space, around 24 m² and pet-friendly by default. */
export default defineFunction({
  id: 'living',
  label: 'Living room',
  colour: '#d86a4f',
  facade: { windowFraction: 0.6 },
  custom: {
    targetArea: { kind: 'number', min: 1, default: 24 },
    petFriendly: { kind: 'boolean', default: true },
  },
});
