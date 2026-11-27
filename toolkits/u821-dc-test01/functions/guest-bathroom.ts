import { defineFunction } from '@student-api';

// Set the room’s colour and classification defaults.
export default defineFunction({
  id: 'guest-bathroom',
  label: 'Guest bathroom',
  colour: '#569c9f',
  facade: { windowFraction: 0.25 },
  custom: {
    zone: { kind: 'enum', values: ['public', 'private', 'service', 'circulation'], default: 'service' },
    privacy: { kind: 'enum', values: ['shared', 'household', 'restricted'], default: 'restricted' },
  },
});
