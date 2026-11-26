import { defineFunction } from '@student-api';

/** A bedroom. Invites nothing. */
export default defineFunction({
  id: 'bedroom',
  label: 'Bedroom',
  colour: '#4f7cc0',
  facade: { windowFraction: 0.35 },
  custom: {
    targetArea: { kind: 'number', min: 1, default: 18 },
  },
});
