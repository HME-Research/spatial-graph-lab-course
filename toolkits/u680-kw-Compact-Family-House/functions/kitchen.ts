import { defineFunction } from '@student-api';

// Set the appearance and default attribute for kitchen rooms.
export default defineFunction({
  id: 'kitchen',
  label: 'Kitchen',
  colour: '#bd7839',
  facade: { windowFraction: 0.35 },
  custom: { hasWindow: { kind: 'boolean', default: true } },
});
