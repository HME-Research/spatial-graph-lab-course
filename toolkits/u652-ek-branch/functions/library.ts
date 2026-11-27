import { defineFunction } from '@student-api';

/** An indoor library and reading space. */
export default defineFunction({
  id: 'library',
  label: 'Library',
  colour: '#8064a2',
  facade: { windowFraction: 0.35 },
});
