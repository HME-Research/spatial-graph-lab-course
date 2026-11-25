import { defineToolkit } from '@student-api';

/**
 * My toolkit: a starter to copy to `toolkits/<your-toolkit-id>/` and change.
 *
 * - `name` is what the app shows ("Toolkit: My toolkit").
 * - `defaultDesign` is a file in `designs/` (without `.json`): new projects take its Building
 *   settings, and `npm run check:toolkit` runs every algorithm on it.
 * - `custom` lists attributes that EVERY node (or edge) of a project with this toolkit has. A
 *   Function can give its own default for one of them (see `functions/`).
 */
export default defineToolkit({
  name: 'My toolkit',
  defaultDesign: 'first-design',
  custom: {
    nodes: {
      occupancy: {
        kind: 'number',
        min: 0,
        label: 'Occupancy (people)',
        description: 'How many people use this space at the same time.',
      },
    },
  },
});
