import { defineFunction } from '@student-api';

/** A balcony: an outdoor space, almost fully open; not facing south by default. */
export default defineFunction({
  id: 'balcony',
  label: 'Balcony',
  colour: '#7cb85a',
  facade: { windowFraction: 0.9 },
  custom: {
    // This Function's own default for the toolkit attribute `facesSouth` (toolkit.ts).
    facesSouth: { kind: 'boolean', default: false },
  },
});
