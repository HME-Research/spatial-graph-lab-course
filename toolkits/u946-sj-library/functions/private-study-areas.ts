import { defineFunction } from '@student-api';

// Make Private Study Areas available when drawing a room.
export default defineFunction({
  id: 'private-study-areas',
  label: 'Private Study Areas',
  custom: { desks: { kind: 'number', min: 0, default: 0 } },
});
