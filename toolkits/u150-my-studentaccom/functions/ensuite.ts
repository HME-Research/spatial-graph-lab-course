import { defineFunction } from '@student-api';

/** Ensuite: a small private bathroom that belongs to one Bedroom. */
export default defineFunction({
  id: 'ensuite',
  label: 'Ensuite',
  colour: '#7fc6c2',
  facade: { windowFraction: 0.1 },
  custom: {
    beds: { kind: 'number', min: 0, default: 0 },
  },
});
