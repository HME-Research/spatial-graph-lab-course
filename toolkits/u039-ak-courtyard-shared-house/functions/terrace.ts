import { defineFunction } from '@student-api';
import { accessLevel } from '../toolkit';

// Set the room's colour, usual access level and any extra fields.
export default defineFunction({
  id: 'terrace',
  label: 'Terrace',
  colour: '#6c9d81',
  custom: {
    accessLevel: { ...accessLevel, default: 'private' },
    terraceUse: { kind: 'enum', values: ['private', 'shared'], default: 'private' },
  },
});
