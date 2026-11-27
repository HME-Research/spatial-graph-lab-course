import { defineToolkit } from '@student-api';

/**
 * u425-rz-branch: a small villa with a large garden at the front and back (about 100 m² each) and
 * room for one or more light wells (courtyards) inside it. Four bedrooms, a kitchen, a living room
 * and a study, plus a Garden and a Courtyard for the outdoor and light-well spaces.
 *
 * `custom` lists the attributes every node of a project with this toolkit has. Each Function in
 * `functions/` gives its own default for them (a room's own value overrides it).
 */
export default defineToolkit({
  name: 'Villa with gardens',
  custom: {
    nodes: {
      targetArea: {
        kind: 'number',
        min: 1,
        label: 'Target area (m²)',
        description: 'The floor area this space should reach. A front or rear garden is about 100 m².',
      },
      petFriendly: {
        kind: 'boolean',
        default: false,
        label: 'Pet-friendly',
        description: 'Whether pets are welcome in this space.',
      },
    },
  },
});
