import { defineNodeType } from '@student-api';

/** The main day room: large windows. */
export default defineNodeType({
  id: 'living',
  label: 'Living',
  facade: { windowFraction: 0.6 },
  attributes: {
    targetArea: { kind: 'number', min: 1, default: 36 },
    priority: { kind: 'number', min: 1, default: 1 },
  },
});
