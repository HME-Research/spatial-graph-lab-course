import { defineFunction } from '@student-api';

// Give dining room rooms their own appearance and programme fields.
export default defineFunction({
  id: 'dining-room',
  label: 'Dining room',
  colour: '#bc9e42',
  facade: { windowFraction: 0.5 },
  custom: {
    zone: { kind: 'enum', values: ['public', 'private', 'service', 'circulation'], default: 'public' },
    privacy: { kind: 'enum', values: ['shared', 'household', 'restricted'], default: 'shared' },
    seatingCapacity: { kind: 'number', min: 0 },
  },
});
