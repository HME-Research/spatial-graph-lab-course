import { defineFunction } from '@student-api';

/** The dining space, which can be connected to the kitchen with an access relationship. */
export default defineFunction({
  id: 'dining-room',
  label: 'Dining room',
  colour: '#b6a24a',
  facade: { windowFraction: 0.4 },
});
