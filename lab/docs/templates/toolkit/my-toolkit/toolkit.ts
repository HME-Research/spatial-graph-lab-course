import { defineToolkit } from '@student-api';

/**
 * My toolkit: a starter to copy to `toolkits/<your-toolkit-name>/` and change.
 *
 * - `name` is exactly the folder name (your toolkit name, e.g. 'u123-hk-house'): the app shows it.
 * - `defaultDesign` is a file in `designs/` (without `.json`): new projects take its Building
 *   settings, and `npm run check:toolkit` runs every algorithm on it.
 * - `custom` lists attributes that EVERY node (or edge) of a project with this toolkit has. A
 *   Function can give its own default for one of them (see `functions/`).
 */
export default defineToolkit({
  name: 'my-toolkit',
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
