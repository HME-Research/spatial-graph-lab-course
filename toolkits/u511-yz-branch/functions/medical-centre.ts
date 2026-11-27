import { defineFunction } from '@student-api';

// Record medical capacity; use the same service period throughout a design.
export default defineFunction({
  id: 'medical-centre',
  label: 'Medical Centre',
  colour: '#c65b68',
  custom: { medicalCapacity: { kind: 'number', min: 0 } },
});
