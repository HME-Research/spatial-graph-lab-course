import { defineFunction } from '@student-api';

/** Give Stair its own acoustic default and façade glazing. */
export default defineFunction({
  id: 'stair',
  label: 'Stair',
  colour: '#c5c7c9',
  facade: { windowFraction: 0.2 },
  custom: {
    noise: { kind: 'enum', values: ['loud', 'medium', 'quiet'], default: 'medium' },
  },
});
