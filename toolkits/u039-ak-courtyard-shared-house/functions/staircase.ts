import { defineFunction } from '@student-api';
import { accessLevel } from '../toolkit';

// Set the room's colour, usual access level and any extra fields.
export default defineFunction({
  id: 'staircase',
  label: 'Staircase',
  colour: '#84745d',
  custom: {
    accessLevel: { ...accessLevel, default: 'resident-only' },
    connectedFloorLevels: { kind: 'text' },
  },
});
