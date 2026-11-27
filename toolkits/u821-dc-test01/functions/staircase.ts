import { defineFunction } from '@student-api';

// Give the staircase its own room type and appearance.
export default defineFunction({
  id: 'staircase',
  label: 'Staircase',
  colour: '#817858',
  facade: { windowFraction: 0.2 },
  custom: {
    zone: { kind: 'enum', values: ['public', 'private', 'service', 'circulation'], default: 'circulation' },
    privacy: { kind: 'enum', values: ['shared', 'household', 'restricted'], default: 'shared' },
  },
});
