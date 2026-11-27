import { defineFunction } from '@student-api';

// Define the appearance and capacity default for this room programme.
export default defineFunction({
  id: 'shared-kitchen',
  label: 'Shared kitchen',
  colour: '#d4623b',
  facade: { windowFraction: 0.4 },
  custom: { seats: { kind: 'number', min: 0, default: 0 } },
});
