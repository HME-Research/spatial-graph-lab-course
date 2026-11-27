import { defineFunction } from '@student-api';

/** A living room: the family's shared room, with four seats by default. */
export default defineFunction({
  id: 'living-room',
  label: 'Living room',
  colour: '#e8a33d',
  facade: { windowFraction: 0.5 },
  custom: {
    // This Function's own default for the toolkit attribute `seats` (toolkit.ts).
    seats: { kind: 'number', min: 0, default: 4 },
  },
});
