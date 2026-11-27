import { defineFunction } from '@student-api';

/** Give Café its own acoustic default and façade glazing. */
export default defineFunction({
  id: 'cafe',
  label: 'Café',
  colour: '#f3aa55',
  facade: { windowFraction: 0.55 },
  custom: {
    noise: { kind: 'enum', values: ['loud', 'medium', 'quiet'], default: 'loud' },
    seats: { kind: 'number', min: 0, default: 18 },
  },
});
