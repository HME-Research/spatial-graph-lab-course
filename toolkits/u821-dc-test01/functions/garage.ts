import { defineFunction } from '@student-api';

// Set the room’s colour and classification defaults.
export default defineFunction({
  id: 'garage',
  label: 'Garage',
  colour: '#81756e',
  facade: { windowFraction: 0.25 },
  custom: {
    zone: { kind: 'enum', values: ['public', 'private', 'service', 'circulation'], default: 'service' },
    privacy: { kind: 'enum', values: ['shared', 'household', 'restricted'], default: 'restricted' },
  },
});
