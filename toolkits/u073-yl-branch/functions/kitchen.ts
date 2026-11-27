import { defineFunction } from '@student-api';

// Record whether the shared kitchen has a window.
export default defineFunction({
  id: 'kitchen',
  label: 'Kitchen',
  colour: '#54936b',
  custom: { hasWindow: { kind: 'boolean', default: true } },
});
