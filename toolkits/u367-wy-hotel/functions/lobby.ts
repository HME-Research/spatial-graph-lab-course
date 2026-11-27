import { defineFunction } from '@student-api';

/** The lobby with reception: where guests check in and wait. */
export default defineFunction({
  id: 'lobby',
  label: 'Lobby with reception',
  colour: '#6aa84f',
  facade: { windowFraction: 0.6 },
  custom: {
    // It has a reception desk unless you say otherwise.
    hasReceptionDesk: { kind: 'boolean', default: true },
  },
});
