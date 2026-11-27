import { defineFunction } from '@student-api';

/** Give Group study its own acoustic default and façade glazing. */
export default defineFunction({
  id: 'group-study',
  label: 'Group study',
  colour: '#c2a9d9',
  facade: { windowFraction: 0.5 },
  custom: {
    noise: { kind: 'enum', values: ['loud', 'medium', 'quiet'], default: 'medium' },
    seats: { kind: 'number', min: 0, default: 12 },
  },
});
