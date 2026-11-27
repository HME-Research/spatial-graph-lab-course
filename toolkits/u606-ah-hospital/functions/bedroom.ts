import { defineFunction } from '@student-api';

// Set the label and appearance for this kind of space.
export default defineFunction({
  id: 'bedroom',
  label: 'Bedroom',
  colour: '#7863a6',
  facade: { windowFraction: 0 },
  // Give this Function its own starting values.
  custom: {
    beds: { kind: 'number', min: 0, default: 5 },
  },
});
