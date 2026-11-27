import { defineFunction } from '@student-api';

// Bedroom 2 starts with one bed; the area transform may propose two beds.
export default defineFunction({
  id: 'bedroom-2',
  label: 'Bedroom 2',
  colour: '#759db8',
  facade: { windowFraction: 0.35 },
  custom: {
    bedCount: { kind: 'number', min: 1, max: 2, default: 1 },
  },
});
