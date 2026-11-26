import { defineFunction } from '@student-api';

/** An outdoor terrace, open to the living room: no glass of its own. Invites nothing. */
export default defineFunction({
  id: 'terrace',
  label: 'Terrace',
  colour: '#7cc9a6',
  facade: { windowFraction: 0 },
  custom: {
    targetArea: { kind: 'number', min: 1, default: 18 },
  },
});
