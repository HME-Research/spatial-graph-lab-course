import { defineNodeType } from '@student-api';

/** Corridors, landings and stairs that join the other rooms. */
export default defineNodeType({
  id: 'circulation',
  label: 'Circulation',
  facade: { windowFraction: 0.2 },
  attributes: {
    targetArea: { kind: 'number', min: 1, default: 9 },
    priority: { kind: 'number', min: 1, default: 6 },
  },
});
