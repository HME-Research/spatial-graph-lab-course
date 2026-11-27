import { defineFunction } from '@student-api';

// Start each bedroom with one bed. Its floor area comes from the drawn footprint.
export default defineFunction({
  id: 'bedroom',
  label: 'Bedroom',
  colour: '#4f7cc0',
  custom: { beds: { kind: 'number', min: 0, default: 1 } },
});
