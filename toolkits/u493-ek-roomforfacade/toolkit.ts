import { defineToolkit } from '@student-api';

// Give every room the same two editable yes/no fields, without defaults.
export default defineToolkit({
  name: 'u493-ek-roomforfacade',
  custom: {
    nodes: {
      needsDaylight: {
        kind: 'boolean',
        label: 'Needs daylight',
        description: 'Does the activity in this room require natural light?',
      },
      canTolerateNoise: {
        kind: 'boolean',
        label: 'Can tolerate noise',
        description: "Is some exterior noise acceptable for this room's intended use?",
      },
    },
  },
});
