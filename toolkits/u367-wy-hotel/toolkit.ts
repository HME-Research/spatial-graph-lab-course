import { defineToolkit } from '@student-api';

/**
 * Small hotel: hotels and guesthouses on one to four levels (entrances, a lobby, corridors, stairs
 * and guest rooms; see `functions/`).
 *
 * - `name` is what the app shows ("Toolkit: u367-wy-hotel").
 * - No `defaultDesign` yet: the designs are drawn in the app and added to `designs/` later.
 * - `custom` lists attributes that EVERY room of a project with this toolkit has. Each Function in
 *   `functions/` gives its own default for the ones it uses.
 */
export default defineToolkit({
  name: 'u367-wy-hotel',
  custom: {
    nodes: {
      countsAsExit: {
        kind: 'boolean',
        label: 'Counts as an exit',
        description: 'Yes if this entrance is an escape exit. "Escape distance" walks to the nearest one.',
      },
      hasReceptionDesk: {
        kind: 'boolean',
        label: 'Has a reception desk',
        description: 'Yes if this lobby has a reception desk.',
      },
      corridorWidth: {
        kind: 'number',
        min: 1.2,
        max: 3,
        label: 'Corridor width (m)',
        description: 'Clear width of the corridor, 1.2 to 3.0 m.',
      },
      isEscapeStair: {
        kind: 'boolean',
        label: 'Is an escape stair',
        description: 'Yes if this stair counts as an escape route. "Escape distance" walks to the nearest one.',
      },
      roomType: {
        kind: 'enum',
        values: ['single', 'double', 'family'],
        label: 'Room type',
        description: 'Single, double or family room. "Room type from area" sets it from the floor area.',
      },
      guests: {
        kind: 'number',
        min: 1,
        max: 4,
        label: 'Number of guests',
        description: 'Guests who sleep in this room, 1 to 4.',
      },
      windowArea: {
        kind: 'number',
        min: 0,
        label: 'Window area (m²)',
        description: 'Glass area of the room\'s windows. "Daylight" compares it with the floor area.',
      },
      hasOutsideWindow: {
        kind: 'boolean',
        label: 'Has an outside window',
        description: 'Yes if the room has a window to the outside.',
      },
    },
  },
});
