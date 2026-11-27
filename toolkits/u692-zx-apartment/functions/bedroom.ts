import { defineFunction } from '@student-api';

/** A bedroom: one bed by default ("Beds from area" gives larger bedrooms two). */
export default defineFunction({
  id: 'bedroom',
  label: 'Bedroom',
  colour: '#4f7cc0',
  facade: { windowFraction: 0.35 },
  custom: {
    // This Function's own default for the toolkit attribute `beds` (toolkit.ts).
    beds: { kind: 'number', min: 0, default: 1 },
  },
});
