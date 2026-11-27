import { defineFunction } from '@student-api';

// Describe the role and typical daylight of this room.
export default defineFunction({
  id: 'covered-courtyard',
  label: 'Covered courtyard',
  colour: '#8bbf9f',
  facade: { windowFraction: 0.7 },
  custom: {
    central: { kind: 'boolean', default: true },
    roofed: { kind: 'boolean', default: true },
  },
});
