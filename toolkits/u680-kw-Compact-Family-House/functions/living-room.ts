import { defineFunction } from '@student-api';

// Set the appearance for living room rooms.
export default defineFunction({
  id: 'living-room',
  label: 'Living room',
  colour: '#528361',
  facade: { windowFraction: 0.45 },
});
