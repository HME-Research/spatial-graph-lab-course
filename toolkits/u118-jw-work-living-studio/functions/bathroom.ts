import { defineFunction } from '@student-api';

// Set the appearance and defaults for Bathroom rooms.
export default defineFunction({
  id: 'bathroom',
  label: 'Bathroom',
  colour: '#547f8b',
  facade: { windowFraction: 0 },
});
