import { defineFunction } from '@student-api';

/** The kitchen: open to the living space or a closed room. */
export default defineFunction({
  id: 'kitchen',
  label: 'Kitchen',
  colour: '#d4623b',
  facade: { windowFraction: 0.4 },
  custom: {
    // A Kitchen has a window unless you say otherwise.
    hasWindow: { kind: 'boolean', default: true },
    // A Kitchen is open unless you say otherwise.
    kitchenType: { kind: 'enum', values: ['open', 'closed'], default: 'open' },
  },
});
