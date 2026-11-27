import { defineFunction } from '@student-api';

// Bedroom 1 starts with two beds; a room's own bed count can override this.
export default defineFunction({
  id: 'bedroom-1',
  label: 'Bedroom 1',
  colour: '#598fc2',
  facade: { windowFraction: 0.35 },
  custom: {
    bedCount: { kind: 'number', min: 1, max: 2, default: 2 },
  },
});
