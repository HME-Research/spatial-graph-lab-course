import { defineFunction } from '@student-api';

// Set the appearance and default attribute for bathroom rooms.
export default defineFunction({
  id: 'bathroom',
  label: 'Bathroom',
  colour: '#497f8c',
  facade: { windowFraction: 0 },
  custom: { hasWindow: { kind: 'boolean', default: false } },
});
