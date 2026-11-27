import { defineFunction } from '@student-api';

// Record the maximum number of people this shelter can accommodate.
export default defineFunction({
  id: 'emergency-shelter',
  label: 'Emergency Shelter',
  colour: '#38966b',
  custom: { shelterCapacity: { kind: 'number', min: 0 } },
});
