import { defineFunction } from '@student-api';

// Set the appearance and defaults for Living room rooms.
export default defineFunction({
  id: 'living-room',
  label: 'Living room',
  colour: '#527a57',
  facade: { windowFraction: 0.5 },
  custom: { hasWindow: { kind: 'boolean', default: true } },
});
