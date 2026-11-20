import { defineFunction } from '@student-api';

/** An outdoor roof terrace on top of a lower room. */
export default defineFunction({
  id: 'terrace',
  label: 'Roof terrace',
  colour: '#7cc9a6',
  facade: { windowFraction: 0 },
  custom: {
    targetArea: { kind: 'number', min: 1, default: 9 },
    priority: { kind: 'number', min: 1, default: 10 },
  },
});
