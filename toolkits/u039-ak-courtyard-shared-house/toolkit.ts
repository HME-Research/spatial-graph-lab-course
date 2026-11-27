import { defineToolkit } from '@student-api';

// Set the shared access field; area and floor level come from the room geometry.
export const accessLevel = {
  kind: 'enum',
  values: ['public', 'semi-public', 'resident-only', 'private'],
} as const;

export default defineToolkit({
  name: 'u039-ak-courtyard-shared-house',
  custom: { nodes: { accessLevel } },
});
