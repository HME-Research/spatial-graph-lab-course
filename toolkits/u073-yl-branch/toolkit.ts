import { defineToolkit } from '@student-api';

// Give the editable fields clear labels in the flat's Properties panel.
export default defineToolkit({
  name: 'u730-yl-flat',
  custom: {
    nodes: {
      beds: { kind: 'number', min: 0, label: 'Number of beds' },
      hasWindow: { kind: 'boolean', label: 'Has a window' },
      seats: { kind: 'number', min: 0, label: 'Number of seats' },
    },
  },
});
