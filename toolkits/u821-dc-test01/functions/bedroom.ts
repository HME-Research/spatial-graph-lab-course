import { defineFunction } from '@student-api';

// Give bedroom rooms their own appearance and programme fields.
export default defineFunction({
  id: 'bedroom',
  label: 'Bedroom',
  colour: '#6977b5',
  facade: { windowFraction: 0.35 },
  custom: {
    zone: { kind: 'enum', values: ['public', 'private', 'service', 'circulation'], default: 'private' },
    privacy: { kind: 'enum', values: ['shared', 'household', 'restricted'], default: 'household' },
    floorLevel: { kind: 'number', min: 0, default: 1 },
    numberOfBeds: { kind: 'number', min: 0, default: 1 },
    bathroomAccess: { kind: 'boolean' },
  },
});
