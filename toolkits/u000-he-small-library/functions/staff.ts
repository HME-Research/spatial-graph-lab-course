import { defineFunction } from '@student-api';

/** Give Staff its own acoustic default and façade glazing. */
export default defineFunction({
  id: 'staff',
  label: 'Staff',
  colour: '#98b995',
  facade: { windowFraction: 0.25 },
  custom: {
    noise: { kind: 'enum', values: ['loud', 'medium', 'quiet'], default: 'medium' },
  },
});
