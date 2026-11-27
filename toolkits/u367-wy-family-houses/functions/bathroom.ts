import { defineFunction } from '@student-api';

/** The bathroom: shower or bathtub, small windows. */
export default defineFunction({
  id: 'bathroom',
  label: 'Bathroom',
  colour: '#5fb3b3',
  facade: { windowFraction: 0.15 },
  custom: {
    // No bathtub unless you say otherwise.
    hasBathtub: { kind: 'boolean', default: false },
  },
});
