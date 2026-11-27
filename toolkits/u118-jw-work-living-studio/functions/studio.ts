import { defineFunction } from '@student-api';

// Set the appearance and defaults for Studio rooms.
export default defineFunction({
  id: 'studio',
  label: 'Studio',
  colour: '#426f8e',
  facade: { windowFraction: 0.35 },
  custom: { hasWindow: { kind: 'boolean', default: true } },
});
