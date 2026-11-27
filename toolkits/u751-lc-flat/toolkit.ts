import { defineToolkit } from '@student-api';

/** Shared house: record beds, workspace capacity and permission for visitors to use a WC. */
export default defineToolkit({
  name: 'Flat shared house',
  custom: {
    nodes: {
      numberOfBeds: {
        kind: 'number',
        min: 0,
        label: 'Number of beds',
        description: 'Beds recorded in a Bedroom; the house is intended for four residents.',
      },
      capacity: {
        kind: 'number',
        min: 0,
        label: 'Workspace capacity (people)',
        description: 'Record space for one resident and up to two visitors: at least three people.',
      },
      visitorAccessAllowed: {
        kind: 'boolean',
        label: 'Visitor access allowed',
        description: 'Set to true to designate a WC that visitors may use.',
      },
    },
  },
});
