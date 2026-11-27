import { defineFunction } from '@student-api';

/** The entrance: the hall every room is arranged around, with storage by default. */
export default defineFunction({
  id: 'entrance',
  label: 'Entrance',
  colour: '#9b9a8f',
  facade: { windowFraction: 0.1 },
  custom: {
    // This Function's own default for the toolkit attribute `hasStorage` (toolkit.ts).
    hasStorage: { kind: 'boolean', default: true },
  },
});
