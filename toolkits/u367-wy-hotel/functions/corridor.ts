import { defineFunction } from '@student-api';

/** A corridor: leads from the stairs to the guest rooms. */
export default defineFunction({
  id: 'corridor',
  label: 'Corridor',
  colour: '#9b9a8f',
  facade: { windowFraction: 0.1 },
  custom: {
    // 1.5 m wide unless you say otherwise.
    corridorWidth: { kind: 'number', min: 1.2, max: 3, default: 1.5 },
  },
});
