import { defineFunction } from '@student-api';

// Define the appearance and capacity default for this room programme.
export default defineFunction({
  id: 'entrance',
  label: 'Entrance',
  colour: '#8e6bb8',
  facade: { windowFraction: 0.3 },

});
