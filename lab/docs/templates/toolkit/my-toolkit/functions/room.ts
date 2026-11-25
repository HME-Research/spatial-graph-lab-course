import { defineFunction } from '@student-api';

/** A room: the main kind of space in this toolkit. Its file name and its id are the same word. */
export default defineFunction({
  id: 'room',
  label: 'Room',
  colour: '#4f7cc0',
  facade: { windowFraction: 0.35 },
  custom: {
    // This Function's own default for the toolkit attribute `occupancy` (toolkit.ts).
    occupancy: { kind: 'number', min: 0, default: 2 },
  },
});
