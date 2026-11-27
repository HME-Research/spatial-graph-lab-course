import { defineToolkit } from '@student-api';

/**
 * Tiny homes: five room Functions (see `functions/`) for homes of 9 to 37 m², an analysis that
 * rates how well each room's area fits its needs ("Space efficiency") and a transform that
 * generates and ranks alternative layouts ("Tiny home iterations"), see `algorithms/`.
 *
 * Every Function in `functions/` gives its own default for each attribute below; set a value on a
 * room to override it for that room only. No defaultDesign: the designs are drawn in the app.
 */
export default defineToolkit({
  name: 'Tiny homes',
  custom: {
    nodes: {
      minArea: {
        kind: 'number',
        min: 0,
        label: 'Minimum area (m²)',
        description: 'The smallest floor area this room needs for its furniture and the space to use it.',
      },
      furniture: {
        kind: 'text',
        label: 'Furniture',
        description: 'The furniture this room must hold, e.g. "Double bed 140 × 200 cm".',
      },
      needsPlumbing: {
        kind: 'boolean',
        label: 'Needs plumbing',
        description: 'Whether the room needs water and drains. Wet rooms side by side can share one plumbing wall.',
      },
      privacy: {
        kind: 'enum',
        values: ['private', 'shared'],
        label: 'Privacy',
        description: 'Private rooms should not be walked through to reach another room.',
      },
      foldAway: {
        kind: 'boolean',
        label: 'Furniture folds away',
        description: 'Multifunctional furniture (fold-down bed, drop-leaf table): when combined into another room, it needs only half its minimum area there.',
      },
    },
  },
});
