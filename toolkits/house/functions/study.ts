import { defineFunction } from '@student-api';

/** A small study or home office. */
export default defineFunction({
  id: 'study',
  label: 'Study',
  colour: '#8b5e3c',
  facade: { windowFraction: 0.4 },
  custom: {
    targetArea: { kind: 'number', min: 1, default: 9 },
    priority: { kind: 'number', min: 1, default: 9 },
  },
});
