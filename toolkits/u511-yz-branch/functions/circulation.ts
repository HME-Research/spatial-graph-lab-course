import { defineFunction } from '@student-api';

// Leave accessibility unset until it has been assessed by the student.
export default defineFunction({
  id: 'circulation',
  label: 'Circulation',
  colour: '#90949b',
  custom: { wheelchairAccessible: { kind: 'boolean' } },
});
