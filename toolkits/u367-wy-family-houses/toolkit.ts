import { defineToolkit } from '@student-api';

/**
 * Family house: small family houses on one or two levels (Entrance, Living room, Kitchen, Bedroom,
 * Bathroom, Stair; see `functions/`).
 *
 * - `name` is what the app shows ("Toolkit: u367-wy-family-houses").
 * - No `defaultDesign` yet: the designs are drawn in the app and added to `designs/` later.
 * - `custom` lists attributes that EVERY room of a project with this toolkit has. Each Function in
 *   `functions/` gives its own default for the ones it uses.
 */
export default defineToolkit({
  name: 'u367-wy-family-houses',
  custom: {
    nodes: {
      isMainEntrance: {
        kind: 'boolean',
        label: 'Main entrance',
        description: 'Yes if this Entrance is the main entrance of the house.',
      },
      hasWindow: {
        kind: 'boolean',
        label: 'Has a window',
        description: 'Yes if the room gets daylight through a window. "Beds and daylight" highlights main rooms without one.',
      },
      kitchenType: {
        kind: 'enum',
        values: ['open', 'closed'],
        label: 'Kitchen type',
        description: 'Open (part of the living space) or closed (a separate room).',
      },
      beds: {
        kind: 'number',
        min: 0,
        max: 4,
        label: 'Number of beds',
        description: 'Beds in this Bedroom, 0 to 4. "Beds from area" sets it from the floor area.',
      },
      hasBathtub: {
        kind: 'boolean',
        label: 'Has a bathtub',
        description: 'Yes if this Bathroom has a bathtub.',
      },
    },
  },
});
