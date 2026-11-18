import { defineNodeType } from '@student-api';

/** A general room. Change the id, label, façade and attributes to make your own type. */
export default defineNodeType({
  id: 'room',
  label: 'Room',
  facade: { windowFraction: 0.3 },
  attributes: {
    quiet: { kind: 'boolean', default: false },
    occupancy: { kind: 'number', min: 0 },
  },
});
