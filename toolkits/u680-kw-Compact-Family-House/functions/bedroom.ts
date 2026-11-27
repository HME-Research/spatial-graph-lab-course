import { defineFunction } from '@student-api';

// Set the appearance and default attribute for bedroom rooms.
export default defineFunction({
  id: 'bedroom',
  label: 'Bedroom',
  colour: '#4f7cc0',
  facade: { windowFraction: 0.35 },
  custom: { numberOfBeds: { kind: 'number', min: 0, default: 1 } },
});
