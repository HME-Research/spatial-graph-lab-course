import { defineFunction } from '@student-api';

// Describe the role and typical daylight of this room.
export default defineFunction({
  id: 'living-room',
  label: 'Living room',
  colour: '#7ba6c9',
  facade: { windowFraction: 0.4 },
  custom: { facesCourtyard: { kind: 'boolean', default: true } },
});
