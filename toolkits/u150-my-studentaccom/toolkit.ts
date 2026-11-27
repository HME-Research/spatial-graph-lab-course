import { defineToolkit } from '@student-api';

/**
 * Student accommodation: bedrooms with their own ensuite, around a shared living room,
 * dining kitchen and laundry.
 *
 * - `name` is what the app shows ("Toolkit: Student accommodation").
 * - No `defaultDesign` yet: you draw your designs in the app and add them to `designs/`.
 * - `custom` lists attributes that EVERY room of a project with this toolkit has. A Function
 *   gives its own default for one of them (see `functions/`).
 */
export default defineToolkit({
  name: 'Student accommodation',
  custom: {
    nodes: {
      beds: {
        kind: 'number',
        min: 0,
        default: 0,
        label: 'Beds',
        description: 'How many students sleep in this room.',
      },
    },
  },
});
