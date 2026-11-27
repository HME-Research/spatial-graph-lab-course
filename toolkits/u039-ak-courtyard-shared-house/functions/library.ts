import { defineFunction } from '@student-api';
import { accessLevel } from '../toolkit';

// Set the room's colour, usual access level and any extra fields.
export default defineFunction({
  id: 'library',
  label: 'Library',
  colour: '#426b99',
  custom: {
    accessLevel: { ...accessLevel, default: 'public' },
    capacity: { kind: 'number', min: 0 },
  },
});
