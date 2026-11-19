import { defineNodeType } from '@student-api';

/** Where you arrive: a small hall with the front door. */
export default defineNodeType({
  id: 'entrance',
  label: 'Entrance',
  facade: { windowFraction: 0.3 },
  attributes: {
    targetArea: { kind: 'number', min: 1, default: 9 },
    priority: { kind: 'number', min: 1, default: 5 },
  },
});
