import { defineNodeType } from '@student-api';

/** Bathroom: small windows for privacy. */
export default defineNodeType({
  id: 'bath',
  label: 'Bath',
  facade: { windowFraction: 0.15 },
  attributes: {
    targetArea: { kind: 'number', min: 1, default: 18 },
    priority: { kind: 'number', min: 1, default: 4 },
  },
});
