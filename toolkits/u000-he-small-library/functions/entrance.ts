import { defineFunction } from '@student-api';

/** Give Entrance its own acoustic default and façade glazing. */
export default defineFunction({
  id: 'entrance',
  label: 'Entrance',
  colour: '#e87851',
  facade: { windowFraction: 0.35 },
  custom: {
    noise: { kind: 'enum', values: ['loud', 'medium', 'quiet'], default: 'loud' },
  },
});
