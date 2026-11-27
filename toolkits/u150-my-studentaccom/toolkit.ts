import { defineToolkit } from '@student-api';

/**
 * u150-my-studentaccom: student accommodation, bedrooms with their own ensuite off a hallway,
 * an open-plan living room and dining kitchen, and a laundry.
 *
 * - `name` is exactly the folder name (the toolkit name): the app shows it ("Toolkit: u150-my-studentaccom").
 * - No `defaultDesign` yet: you draw your designs in the app and add them to `designs/`.
 * - `custom` lists attributes that EVERY room of a project with this toolkit has. A Function
 *   gives its own default for one of them (see `functions/`).
 */
export default defineToolkit({
  name: 'u150-my-studentaccom',
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
