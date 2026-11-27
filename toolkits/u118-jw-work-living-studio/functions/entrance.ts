import { defineFunction } from '@student-api';

// Set the appearance and defaults for Entrance rooms.
export default defineFunction({
  id: 'entrance',
  label: 'Entrance',
  colour: '#756c61',
  facade: { windowFraction: 0 },
});
