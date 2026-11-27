import { defineFunction } from '@student-api';

// Describe the role and typical daylight of this room.
export default defineFunction({
  id: 'entrance',
  label: 'Entrance',
  colour: '#d9a66f',
  facade: { windowFraction: 0.25 },
  custom: { welcoming: { kind: 'boolean', default: true } },
});
