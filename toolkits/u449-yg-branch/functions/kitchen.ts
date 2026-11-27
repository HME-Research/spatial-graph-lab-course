import { defineFunction } from '@student-api';

// Describe the role and typical daylight of this room.
export default defineFunction({
  id: 'kitchen',
  label: 'Kitchen',
  colour: '#e7c968',
  facade: { windowFraction: 0.35 },
  custom: { daylight: { kind: 'enum', values: ['high', 'medium', 'low'], default: 'high' } },
});
