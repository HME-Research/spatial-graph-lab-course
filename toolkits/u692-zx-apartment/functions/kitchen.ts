import { defineFunction } from '@student-api';

/** A kitchen: has a window by default; set "Has a window" to false for an inner kitchen. */
export default defineFunction({
  id: 'kitchen',
  label: 'Kitchen',
  colour: '#d4623b',
  facade: { windowFraction: 0.4 },
  custom: {
    // This Function's own default for the toolkit attribute `hasWindow` (toolkit.ts).
    hasWindow: { kind: 'boolean', default: true },
  },
});
