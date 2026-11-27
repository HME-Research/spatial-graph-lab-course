import { defineFunction } from '@student-api';

/** A bathroom: small windows, a shower and no bathtub by default. */
export default defineFunction({
  id: 'bathroom',
  label: 'Bathroom',
  colour: '#5fb3b3',
  facade: { windowFraction: 0.15 },
  custom: {
    // This Function's own default for the toolkit attribute `hasBathtub` (toolkit.ts).
    hasBathtub: { kind: 'boolean', default: false },
  },
});
