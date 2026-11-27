import { defineFunction } from '@student-api';

/** The kitchen, with two windows by default. */
export default defineFunction({
  id: 'kitchen',
  label: 'Kitchen',
  colour: '#d9824b',
  facade: { windowFraction: 0.4 },
  custom: {
    windowCount: { kind: 'number', min: 0, default: 2 },
  },
});
