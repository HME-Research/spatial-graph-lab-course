import { defineFunction } from '@student-api';

// Set the appearance and defaults for Kitchen rooms.
export default defineFunction({
  id: 'kitchen',
  label: 'Kitchen',
  colour: '#a6813d',
  facade: { windowFraction: 0.35 },
  custom: { hasWindow: { kind: 'boolean', default: true } },
});
