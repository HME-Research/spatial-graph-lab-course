import { defineFunction } from '@student-api';

// Describe the role and typical daylight of this room.
export default defineFunction({
  id: 'childrens-bedroom',
  label: 'Children’s bedroom',
  colour: '#e58d9e',
  facade: { windowFraction: 0.35 },
  custom: {
    floor: { kind: 'enum', values: ['ground', 'upstairs'], default: 'upstairs' },
    privateBathroom: { kind: 'boolean', default: true },
  },
});
