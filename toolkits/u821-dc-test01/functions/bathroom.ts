import { defineFunction } from '@student-api';

// Give bathroom rooms their own appearance and programme fields.
export default defineFunction({
  id: 'bathroom',
  label: 'Bathroom',
  colour: '#519b9b',
  facade: { windowFraction: 0.15 },
  custom: {
    zone: { kind: 'enum', values: ['public', 'private', 'service', 'circulation'], default: 'private' },
    privacy: { kind: 'enum', values: ['shared', 'household', 'restricted'], default: 'household' },
    floorLevel: { kind: 'number', min: 0, default: 1 },
    associatedBedroom: { kind: 'number', min: 1 },
  },
});
