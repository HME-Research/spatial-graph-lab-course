import { defineFunction } from '@student-api';

// Give the main entrance its own room type and appearance.
export default defineFunction({
  id: 'main-entrance',
  label: 'Main entrance',
  colour: '#777685',
  facade: { windowFraction: 0.2 },
  custom: {
    zone: { kind: 'enum', values: ['public', 'private', 'service', 'circulation'], default: 'circulation' },
    privacy: { kind: 'enum', values: ['shared', 'household', 'restricted'], default: 'shared' },
  },
});
