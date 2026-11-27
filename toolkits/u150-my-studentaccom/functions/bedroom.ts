import { defineFunction } from '@student-api';

/** Bedroom: one student's private room. Each Bedroom should have its own Ensuite. */
export default defineFunction({
  id: 'bedroom',
  label: 'Bedroom',
  colour: '#5b8fd1',
  facade: { windowFraction: 0.35 },
  custom: {
    // This Function's own default for the toolkit attribute `beds` (toolkit.ts): one student.
    beds: { kind: 'number', min: 0, default: 1 },
  },
});
