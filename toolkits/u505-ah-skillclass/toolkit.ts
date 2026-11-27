import { defineToolkit } from '@student-api';

/** Give every space its shared planning fields. */
export default defineToolkit({
  name: 'u505-ah-skillclass',
  custom: {
    nodes: {
      occupancy: {
        kind: 'number',
        min: 0,
        label: 'Planned occupancy',
        description: 'Estimated number of people using this space at peak occupancy.',
      },
    },
  },
});
