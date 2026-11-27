import { defineFunction } from '@student-api';

// Set the room’s colour and classification defaults.
export default defineFunction({
  id: 'upper-living-room',
  label: 'Upper-floor living room',
  colour: '#ca9566',
  facade: { windowFraction: 0.25 },
  custom: {
    zone: { kind: 'enum', values: ['public', 'private', 'service', 'circulation'], default: 'private' },
    privacy: { kind: 'enum', values: ['shared', 'household', 'restricted'], default: 'household' },
  },
});
