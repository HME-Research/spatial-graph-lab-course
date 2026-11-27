import { defineFunction } from '@student-api';

/** The entrance: where you come into the house. */
export default defineFunction({
  id: 'entrance',
  label: 'Entrance',
  colour: '#e0a43a',
  facade: { windowFraction: 0.2 },
  custom: {
    // An Entrance is the main entrance unless you say otherwise.
    isMainEntrance: { kind: 'boolean', default: true },
  },
});
