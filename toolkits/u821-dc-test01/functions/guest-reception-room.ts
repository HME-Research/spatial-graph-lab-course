import { defineFunction } from '@student-api';

// Give guest reception room rooms their own appearance and programme fields.
export default defineFunction({
  id: 'guest-reception-room',
  label: 'Guest reception room',
  colour: '#b06583',
  facade: { windowFraction: 0.45 },
  custom: {
    zone: { kind: 'enum', values: ['public', 'private', 'service', 'circulation'], default: 'public' },
    privacy: { kind: 'enum', values: ['shared', 'household', 'restricted'], default: 'shared' },
    seatingCapacity: { kind: 'number', min: 0 },
    entranceProximity: { kind: 'enum', values: ['near', 'far'] },
  },
});
