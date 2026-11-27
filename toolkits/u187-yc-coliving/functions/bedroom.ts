import { defineFunction } from '@student-api';

// Define the appearance and capacity default for this room programme.
export default defineFunction({
  id: 'bedroom',
  label: 'Bedroom',
  colour: '#4f7cc0',
  facade: { windowFraction: 0.35 },
  custom: { beds: { kind: 'number', min: 0, default: 1 } },
});
