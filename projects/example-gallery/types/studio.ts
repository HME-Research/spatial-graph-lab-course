import { defineNodeType } from '@student-api';

/** Working studio with a smaller punched window. */
export default defineNodeType({
  id: 'studio',
  label: 'Studio',
  facade: { windowFraction: 0.25 },
  attributes: {
    occupancy: { kind: 'number', min: 0 },
    public: { kind: 'boolean', default: false },
  },
});
