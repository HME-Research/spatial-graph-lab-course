import { defineFunction } from '@student-api';

// Set the appearance and defaults for Meeting room rooms.
export default defineFunction({
  id: 'meeting-room',
  label: 'Meeting room',
  colour: '#a2643e',
  facade: { windowFraction: 0.35 },
  custom: { hasWindow: { kind: 'boolean', default: true } },
});
