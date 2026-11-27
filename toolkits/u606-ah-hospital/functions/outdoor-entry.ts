import { defineFunction } from '@student-api';

// Use this Function for the open-air landing outside Reception.
export default defineFunction({
  id: 'outdoor-entry',
  label: 'Outdoor Entry',
  colour: '#8a8173',
  facade: { windowFraction: 0 },
});
