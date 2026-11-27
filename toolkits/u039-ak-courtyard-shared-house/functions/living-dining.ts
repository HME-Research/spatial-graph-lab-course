import { defineFunction } from '@student-api';
import { accessLevel } from '../toolkit';

// Set the room's colour, usual access level and any extra fields.
export default defineFunction({
  id: 'living-dining',
  label: 'Living/Dining room',
  colour: '#b58d39',
  custom: {
    accessLevel: { ...accessLevel, default: 'resident-only' },
    capacity: { kind: 'number', min: 0 },
  },
});
