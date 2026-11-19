import { defineNodeType } from '@student-api';

/** A bedroom; the default target makes it a large main bedroom. */
export default defineNodeType({
  id: 'bedroom',
  label: 'Bedroom',
  facade: { windowFraction: 0.35 },
  attributes: {
    targetArea: { kind: 'number', min: 1, default: 45 },
    priority: { kind: 'number', min: 1, default: 3 },
  },
});
