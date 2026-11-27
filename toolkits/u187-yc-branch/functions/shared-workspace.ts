import { defineFunction } from '@student-api';

// Define the appearance and capacity default for this room programme.
export default defineFunction({
  id: 'shared-workspace',
  label: 'Shared workspace',
  colour: '#4f8f7a',
  facade: { windowFraction: 0.5 },
  custom: { desks: { kind: 'number', min: 0, default: 0 } },
});
