import { defineFunction } from '@student-api';
import { accessLevel } from '../toolkit';

// Set the room's colour, usual access level and any extra fields.
export default defineFunction({
  id: 'courtyard',
  label: 'Courtyard',
  colour: '#588654',
  custom: {
    accessLevel: { ...accessLevel, default: 'semi-public' },
  },
});
