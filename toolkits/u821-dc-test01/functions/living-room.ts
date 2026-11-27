import { defineFunction } from '@student-api';

// Give living room rooms their own appearance and programme fields.
export default defineFunction({
  id: 'living-room',
  label: 'Living room',
  colour: '#d88d50',
  facade: { windowFraction: 0.65 },
  custom: {
    zone: { kind: 'enum', values: ['public', 'private', 'service', 'circulation'], default: 'public' },
    privacy: { kind: 'enum', values: ['shared', 'household', 'restricted'], default: 'shared' },
    seatingCapacity: { kind: 'number', min: 0 },
    outdoorAccess: { kind: 'boolean' },
  },
});
