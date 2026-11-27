import { defineToolkit } from '@student-api';

// Give every room the same fields, with defaults for specific Functions below.
export default defineToolkit({
  name: 'Work-living studio',
  custom: {
    nodes: {
      beds: { kind: 'number', min: 0, label: 'Beds' },
      hasWindow: { kind: 'boolean', default: false, label: 'Has window' },
      scheduledUse: {
        kind: 'enum',
        values: ['Day: meeting room', 'Evening: living room'],
        label: 'Scheduled use',
      },
    },
  },
});
