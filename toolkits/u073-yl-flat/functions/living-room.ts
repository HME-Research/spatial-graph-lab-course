import { defineFunction } from '@student-api';

// Record how many students can sit together in the living room.
export default defineFunction({
  id: 'living-room',
  label: 'Living room',
  colour: '#d49754',
  custom: { seats: { kind: 'number', min: 0, default: 4 } },
});
