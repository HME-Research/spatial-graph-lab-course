import { defineFunction } from '@student-api';

/** Workspace: leave capacity unrecorded until the student sets it in Properties. */
export default defineFunction({
  id: 'workspace',
  label: 'Workspace',
  colour: '#8b5e3c',
  custom: {
    capacity: { kind: 'number', min: 0 },
  },
});
