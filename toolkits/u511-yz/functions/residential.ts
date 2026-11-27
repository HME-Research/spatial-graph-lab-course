import { defineFunction } from '@student-api';

// Record the total population and the subset with limited mobility.
export default defineFunction({
  id: 'residential',
  label: 'Residential',
  colour: '#4f7cc0',
  custom: {
    residentCount: { kind: 'number', min: 0 },
    limitedMobilityResidents: { kind: 'number', min: 0 },
  },
});
