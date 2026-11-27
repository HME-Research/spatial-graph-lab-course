import { defineFunction } from '@student-api';
import { accessLevel } from '../toolkit';

// Set the room's colour, usual access level and any extra fields.
export default defineFunction({
  id: 'corridor',
  label: 'Corridor',
  colour: '#9d7a62',
  custom: {
    accessLevel: { ...accessLevel, default: 'resident-only' },
  },
});
