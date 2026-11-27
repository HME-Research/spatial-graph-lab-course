import { defineFunction } from '@student-api';

/** Give Reading room its own acoustic default and façade glazing. */
export default defineFunction({
  id: 'reading-room',
  label: 'Reading room',
  colour: '#5ca8cb',
  facade: { windowFraction: 0.85 },
  custom: {
    noise: { kind: 'enum', values: ['loud', 'medium', 'quiet'], default: 'quiet' },
    seats: { kind: 'number', min: 0, default: 28 },
  },
});
