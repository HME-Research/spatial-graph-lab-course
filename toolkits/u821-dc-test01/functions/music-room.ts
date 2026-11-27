import { defineFunction } from '@student-api';

// Set the room’s colour and classification defaults.
export default defineFunction({
  id: 'music-room',
  label: 'Music room',
  colour: '#9975ae',
  facade: { windowFraction: 0.25 },
  custom: {
    zone: { kind: 'enum', values: ['public', 'private', 'service', 'circulation'], default: 'public' },
    privacy: { kind: 'enum', values: ['shared', 'household', 'restricted'], default: 'shared' },
  },
});
