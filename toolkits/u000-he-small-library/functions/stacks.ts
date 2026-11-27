import { defineFunction } from '@student-api';

/** Give Stacks its own acoustic default and façade glazing. */
export default defineFunction({
  id: 'stacks',
  label: 'Stacks',
  colour: '#72839b',
  facade: { windowFraction: 0.0 },
  custom: {
    noise: { kind: 'enum', values: ['loud', 'medium', 'quiet'], default: 'quiet' },
    shelves: { kind: 'number', min: 0, default: 48 },
  },
});
