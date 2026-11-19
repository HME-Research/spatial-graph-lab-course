import { defineNodeType } from '@student-api';

/** Cooking and eating, open to the living room. */
export default defineNodeType({
  id: 'kitchen',
  label: 'Kitchen',
  facade: { windowFraction: 0.4 },
  attributes: {
    targetArea: { kind: 'number', min: 1, default: 27 },
    priority: { kind: 'number', min: 1, default: 2 },
  },
});
