import { defineFunction } from '@student-api';

// Set the appearance and defaults for Bedroom rooms.
export default defineFunction({
  id: 'bedroom',
  label: 'Bedroom',
  colour: '#735c96',
  facade: { windowFraction: 0 },
  custom: { beds: { kind: 'number', min: 0, default: 2 } },
});
