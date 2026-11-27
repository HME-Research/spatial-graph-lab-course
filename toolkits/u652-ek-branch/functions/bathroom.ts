import { defineFunction } from '@student-api';

/** A bathroom, marked as ensuite or detached with its bathroomType attribute. */
export default defineFunction({
  id: 'bathroom',
  label: 'Bathroom',
  colour: '#51a9b5',
  facade: { windowFraction: 0.15 },
  custom: {
    bathroomType: { kind: 'enum', values: ['ensuite', 'detached'], default: 'detached' },
  },
});
