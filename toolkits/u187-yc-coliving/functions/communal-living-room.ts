import { defineFunction } from '@student-api';

// Define the appearance and capacity default for this room programme.
export default defineFunction({
  id: 'communal-living-room',
  label: 'Communal living room',
  colour: '#e8a33d',
  facade: { windowFraction: 0.6 },
  custom: { seats: { kind: 'number', min: 0, default: 0 } },
});
