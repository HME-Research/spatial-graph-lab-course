import { defineFunction } from '@student-api';

// Set the room’s colour and classification defaults.
export default defineFunction({
  id: 'swimming-pool',
  label: 'Swimming pool',
  colour: '#378eb7',
  facade: { windowFraction: 1 },
  custom: {
    zone: { kind: 'enum', values: ['public', 'private', 'service', 'circulation'], default: 'public' },
    privacy: { kind: 'enum', values: ['shared', 'household', 'restricted'], default: 'shared' },
  },
});
