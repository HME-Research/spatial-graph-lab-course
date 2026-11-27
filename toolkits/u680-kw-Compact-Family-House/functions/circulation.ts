import { defineFunction } from '@student-api';

// Set the appearance for circulation rooms.
export default defineFunction({
  id: 'circulation',
  label: 'Circulation',
  colour: '#84798e',
  facade: { windowFraction: 0.1 },
});
