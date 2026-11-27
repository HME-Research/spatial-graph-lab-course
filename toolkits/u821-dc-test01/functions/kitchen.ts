import { defineFunction } from '@student-api';

// Give kitchen rooms their own appearance and programme fields.
export default defineFunction({
  id: 'kitchen',
  label: 'Kitchen',
  colour: '#65965f',
  facade: { windowFraction: 0.35 },
  custom: {
    zone: { kind: 'enum', values: ['public', 'private', 'service', 'circulation'], default: 'service' },
    privacy: { kind: 'enum', values: ['shared', 'household', 'restricted'], default: 'restricted' },
    ventilation: { kind: 'enum', values: ['natural', 'mechanical', 'both'] },
    serviceAccess: { kind: 'boolean' },
  },
});
