import { defineFunction } from '@student-api';

// Record medical capacity; use the same service period throughout a design.
export default defineFunction({
  id: 'medical-centre',
  label: 'Medical Centre',
  colour: '#f2cc3d',
  custom: { medicalCapacity: { kind: 'number', min: 0 } },
});
