import { defineToolkit } from '@student-api';

// Declare the house vocabulary; you will draw its rooms and relationships in the app.
export default defineToolkit({
  name: 'Two-Storey Family House',
  custom: {
    nodes: {
      bedCount: {
        kind: 'number',
        min: 1,
        max: 2,
        label: 'Number of beds',
        description: 'How many beds this bedroom contains.',
      },
      windowCount: {
        kind: 'number',
        min: 0,
        label: 'Number of windows',
        description: 'How many windows this room should have.',
      },
      bathroomType: {
        kind: 'enum',
        values: ['ensuite', 'detached'],
        label: 'Bathroom type',
        description: 'Whether this bathroom is an ensuite or a separate bathroom.',
      },
    },
  },
});
