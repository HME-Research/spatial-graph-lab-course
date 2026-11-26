import { defineToolkit } from '@student-api';

/**
 * The Growing house toolkit: a house that grows from one seed cell (a Hall) by simple adjacency rules,
 * one generation per Run, and is then rated room by room. Eight room Functions (see `functions/`),
 * four custom room attributes, three transforms and one design analysis (see `algorithms/`).
 *
 * Each Function in `functions/` gives its own default for `targetArea`; set a value on a room to
 * override it for that room only.
 */
export default defineToolkit({
  name: 'Growing house',
  defaultDesign: 'seed',
  custom: {
    nodes: {
      targetArea: {
        kind: 'number',
        min: 1,
        label: 'Target area (m²)',
        description: 'The floor area this room should grow to. "Grow rooms to target area" adds one cell per Run until it reaches it.',
      },
      generation: {
        kind: 'number',
        min: 0,
        default: 0,
        label: 'Generation',
        description: 'When the room was grown: 0 for the seed Hall, 1 for the rooms it invited, and so on.',
      },
      privacy: {
        kind: 'enum',
        values: ['public', 'shared', 'private'],
        label: 'Privacy',
        description: 'Set by "Rate the rooms" from the number of steps from the Hall.',
      },
      daylight: {
        kind: 'enum',
        values: ['good', 'poor', 'none'],
        label: 'Daylight',
        description: 'Set by "Rate the rooms" from the length of the room\'s exterior façade.',
      },
    },
  },
});
