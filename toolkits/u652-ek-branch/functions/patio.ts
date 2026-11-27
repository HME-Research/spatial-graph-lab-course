import { defineFunction } from '@student-api';

/** An outdoor patio space. */
export default defineFunction({
  id: 'patio',
  label: 'Patio',
  colour: '#73a66b',
  facade: { windowFraction: 0.25 },
});
