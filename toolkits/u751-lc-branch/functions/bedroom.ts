import { defineFunction } from '@student-api';

/** Bedroom: record beds; visitor searches never enter this room. */
export default defineFunction({
  id: 'bedroom',
  label: 'Bedroom',
  colour: '#4f7cc0',
  custom: {
    numberOfBeds: { kind: 'number', min: 0, default: 1 },
  },
});
