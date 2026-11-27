import { defineToolkit } from '@student-api';

export default defineToolkit({
  name: 'u606-ah-hospital',
  custom: {
    // Record furniture and windows on rooms.
    nodes: {
      beds: { kind: 'number', min: 0, label: 'Single beds' },
      desks: { kind: 'number', min: 0, label: 'Desks' },
      chairs: { kind: 'number', min: 0, label: 'Chairs' },
      hasWindows: { kind: 'boolean', label: 'Has windows' },
    },
    // Mark connections chosen by the circulation transform.
    edges: {
      circulationPath: { kind: 'boolean', label: 'On a circulation path', default: false },
    },
  },
});
