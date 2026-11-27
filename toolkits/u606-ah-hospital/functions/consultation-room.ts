import { defineFunction } from '@student-api';

// Set the label and appearance for this kind of space.
export default defineFunction({
  id: 'consultation-room',
  label: 'Consultation Room',
  colour: '#458693',
  facade: { windowFraction: 0 },
  // Give this Function its own starting values.
  custom: {
    desks: { kind: 'number', min: 0, default: 1 },
    chairs: { kind: 'number', min: 0, default: 2 },
  },
});
