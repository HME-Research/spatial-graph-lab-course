import { defineFunction } from '@student-api';

// Set the appearance for entrance rooms.
export default defineFunction({
  id: 'entrance',
  label: 'Entrance',
  colour: '#9c644b',
  facade: { windowFraction: 0.15 },
});
