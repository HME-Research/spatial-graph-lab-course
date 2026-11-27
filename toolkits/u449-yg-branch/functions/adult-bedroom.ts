import { defineFunction } from '@student-api';

// Describe the role and typical daylight of this room.
export default defineFunction({
  id: 'adult-bedroom',
  label: 'Adult bedroom',
  colour: '#5f83aa',
  facade: { windowFraction: 0.35 },
  custom: {
    floor: { kind: 'enum', values: ['ground', 'upstairs'], default: 'upstairs' },
    privateBathroom: { kind: 'boolean', default: true },
  },
});
