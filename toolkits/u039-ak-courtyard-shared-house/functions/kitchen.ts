import { defineFunction } from '@student-api';
import { accessLevel } from '../toolkit';

// Set the room's colour, usual access level and any extra fields.
export default defineFunction({
  id: 'kitchen',
  label: 'Kitchen',
  colour: '#cc7849',
  custom: {
    accessLevel: { ...accessLevel, default: 'resident-only' },
    capacity: { kind: 'number', min: 0 },
    hasWindow: { kind: 'boolean' },
  },
});
