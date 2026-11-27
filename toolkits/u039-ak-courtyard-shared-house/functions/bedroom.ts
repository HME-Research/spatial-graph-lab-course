import { defineFunction } from '@student-api';
import { accessLevel } from '../toolkit';

// Set the room's colour, usual access level and any extra fields.
export default defineFunction({
  id: 'bedroom',
  label: 'Bedroom',
  colour: '#8665a8',
  custom: {
    accessLevel: { ...accessLevel, default: 'private' },
    beds: { kind: 'number', min: 1, default: 1 },
    terraceAccess: { kind: 'boolean', default: false },
    windowFacingSides: { kind: 'number', min: 0, max: 4 },
  },
});
