import { defineFunction } from '@student-api';

// Set the label and appearance for this kind of space.
export default defineFunction({
  id: 'hallway',
  label: 'Hallway',
  colour: '#73936b',
  facade: { windowFraction: 0.3 },
  // Give this Function its own starting values.
  custom: {
    hasWindows: { kind: 'boolean', default: true },
  },
});
