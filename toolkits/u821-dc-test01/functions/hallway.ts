import { defineFunction } from '@student-api';

// Give the hallway its own room type and appearance.
export default defineFunction({
  id: 'hallway',
  label: 'Hallway',
  colour: '#8d8174',
  facade: { windowFraction: 0.15 },
  custom: {
    zone: { kind: 'enum', values: ['public', 'private', 'service', 'circulation'], default: 'circulation' },
    privacy: { kind: 'enum', values: ['shared', 'household', 'restricted'], default: 'shared' },
  },
});
