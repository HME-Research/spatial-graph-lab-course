import { defineFunction } from '@student-api';

/** The stair that joins the two levels. It has no attributes of its own. */
export default defineFunction({
  id: 'stair',
  label: 'Stair',
  colour: '#56606e',
  facade: { windowFraction: 0.2 },
});
