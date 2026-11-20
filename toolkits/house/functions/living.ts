import { defineFunction } from '@student-api';

/** The main day room: large windows. */
export default defineFunction({
  id: 'living',
  label: 'Living',
  colour: '#e8a33d',
  facade: { windowFraction: 0.6 },
  custom: {
    targetArea: { kind: 'number', min: 1, default: 36 },
    priority: { kind: 'number', min: 1, default: 1 },
  },
});
