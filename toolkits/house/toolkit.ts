import { defineToolkit } from '@student-api';

/**
 * The House toolkit: twelve room Functions (see `functions/`), two custom room attributes and one transform
 * ("Grow to target area", see `algorithms/`). Every attribute here is read by that transform.
 *
 * Each Function in `functions/` gives its own default for both attributes; set a value on a room to
 * override it for that room only.
 */
export default defineToolkit({
  name: 'House',
  defaultDesign: 'house',
  custom: {
    nodes: {
      targetArea: {
        kind: 'number',
        min: 1,
        label: 'Target area (m²)',
        description: 'The floor area this room should grow to. "Grow to target area" enlarges the room until it reaches it.',
      },
      priority: {
        kind: 'number',
        min: 1,
        label: 'Priority',
        description: 'Growth order, a whole number: 1 grows first. Rooms with the same priority grow in id order.',
      },
    },
  },
});
