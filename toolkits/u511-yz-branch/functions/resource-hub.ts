import { defineFunction } from '@student-api';

// Record supplies in a consistent unit chosen for the design.
export default defineFunction({
  id: 'resource-hub',
  label: 'Resource Hub',
  colour: '#c48a32',
  custom: { resourceCapacity: { kind: 'number', min: 0 } },
});
