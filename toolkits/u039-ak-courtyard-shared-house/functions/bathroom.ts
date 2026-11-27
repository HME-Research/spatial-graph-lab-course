import { defineFunction } from '@student-api';
import { accessLevel } from '../toolkit';

// Set the room's colour, usual access level and any extra fields.
export default defineFunction({
  id: 'bathroom',
  label: 'Bathroom',
  colour: '#4b8ba1',
  custom: {
    accessLevel: { ...accessLevel, default: 'resident-only' },
    bathroomUse: { kind: 'enum', values: ['private', 'shared'], default: 'shared' },
  },
});
