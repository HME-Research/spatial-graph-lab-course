import { defineFunction } from '@student-api';

/** WC: visitors need explicit permission before this room becomes a destination. */
export default defineFunction({
  id: 'wc',
  label: 'WC',
  colour: '#3fa9b5',
  custom: {
    visitorAccessAllowed: { kind: 'boolean', default: false },
  },
});
