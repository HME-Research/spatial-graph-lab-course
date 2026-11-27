import { defineFunction } from '@student-api';

// Describe the role and typical daylight of this room.
export default defineFunction({
  id: 'guest-bedroom',
  label: 'Guest bedroom',
  colour: '#9b8ac4',
  facade: { windowFraction: 0.35 },
  custom: { floor: { kind: 'enum', values: ['ground', 'upstairs'], default: 'ground' } },
});
