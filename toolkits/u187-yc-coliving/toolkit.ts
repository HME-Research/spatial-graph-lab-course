import { defineToolkit } from '@student-api';

// Record capacities; each Function supplies its relevant default.
export default defineToolkit({
  name: 'u187-yc-coliving',
  custom: {
    nodes: {
      beds: { kind: 'number', min: 0, default: 0, label: 'Number of beds' },
      seats: { kind: 'number', min: 0, default: 0, label: 'Number of seats' },
      desks: { kind: 'number', min: 0, default: 0, label: 'Number of desks' },
    },
  },
});
