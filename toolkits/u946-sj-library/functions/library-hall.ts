import { defineFunction } from '@student-api';

// Make Library Hall available when drawing a room.
export default defineFunction({
  id: 'library-hall',
  label: 'Library Hall',
  custom: { bookshelves: { kind: 'number', min: 0, default: 0 } },
});
