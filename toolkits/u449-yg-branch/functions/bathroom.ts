import { defineFunction } from '@student-api';

// Describe the role and typical daylight of this room.
export default defineFunction({
  id: 'bathroom',
  label: 'Bathroom',
  colour: '#6cb8bd',
  facade: { windowFraction: 0.15 },
});
