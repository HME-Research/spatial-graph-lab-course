import { defineFunction } from '@student-api';
import { accessLevel } from '../toolkit';

// Set the room's colour, usual access level and any extra fields.
export default defineFunction({
  id: 'gallery',
  label: 'Gallery',
  colour: '#d0656a',
  custom: {
    accessLevel: { ...accessLevel, default: 'public' },
  },
});
