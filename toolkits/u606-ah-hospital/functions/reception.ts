import { defineFunction } from '@student-api';

// Set the label and appearance for this kind of space.
export default defineFunction({
  id: 'reception',
  label: 'Reception',
  colour: '#c38b42',
  facade: { windowFraction: 0.4 },
  // Give this Function its own starting values.
  custom: {
    hasWindows: { kind: 'boolean', default: true },
  },
});
