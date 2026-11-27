import { defineToolkit } from '@student-api';

/**
 * ZX Quiet bedrooms: small family apartments arranged around an entrance, checked for quiet,
 * private Bedrooms.
 *
 * - `name` is what the app shows ("Toolkit: u692-zx-apartment").
 * - No `defaultDesign` yet: the designs are drawn in the app and added to `designs/` later.
 * - `custom` lists attributes that EVERY node of a project with this toolkit has. Each one belongs
 *   to one Function, which gives it its own default (see `functions/`); other rooms have no value.
 */
export default defineToolkit({
  name: 'u692-zx-apartment',
  custom: {
    nodes: {
      beds: {
        kind: 'number',
        min: 0,
        label: 'Number of beds',
        description: 'How many beds a Bedroom has; one bed sleeps one person.',
      },
      hasWindow: {
        kind: 'boolean',
        label: 'Has a window',
        description: 'Whether a Kitchen has a window.',
      },
      hasBathtub: {
        kind: 'boolean',
        label: 'Has a bathtub',
        description: 'Whether a Bathroom has a bathtub.',
      },
      seats: {
        kind: 'number',
        min: 0,
        label: 'Number of seats',
        description: 'How many people can sit in a Living room.',
      },
      facesSouth: {
        kind: 'boolean',
        label: 'Faces south',
        description: 'Whether a Balcony faces south.',
      },
      hasStorage: {
        kind: 'boolean',
        label: 'Has storage',
        description: 'Whether an Entrance has storage (a wardrobe or cupboard).',
      },
    },
  },
});
