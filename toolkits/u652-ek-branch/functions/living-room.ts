import { defineFunction } from '@student-api';

/** The main shared living space. */
export default defineFunction({
  id: 'living-room',
  label: 'Living room',
  colour: '#c7903e',
  facade: { windowFraction: 0.6 },
});
