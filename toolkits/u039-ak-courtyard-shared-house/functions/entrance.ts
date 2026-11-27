import { defineFunction } from '@student-api';
import { accessLevel } from '../toolkit';

// Set the room's colour, usual access level and any extra fields.
export default defineFunction({
  id: 'entrance',
  label: 'Entrance',
  colour: '#66717e',
  custom: {
    accessLevel: { ...accessLevel, default: 'public' },
    entranceType: { kind: 'enum', values: ['public', 'resident-only'] },
  },
});
