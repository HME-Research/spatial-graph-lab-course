import { defineToolkit } from '@student-api';

// Give the project readable field labels without supplying assumed values.
export default defineToolkit({
  name: 'Community Resilience Toolkit',
  custom: {
    nodes: {
      residentCount: { kind: 'number', min: 0, label: 'Resident count' },
      limitedMobilityResidents: { kind: 'number', min: 0, label: 'Residents with limited mobility' },
      shelterCapacity: { kind: 'number', min: 0, label: 'Maximum shelter capacity (people)' },
      medicalCapacity: { kind: 'number', min: 0, label: 'Medical service capacity (people per chosen period)' },
      resourceCapacity: { kind: 'number', min: 0, label: 'Resource supply capacity (chosen units)' },
      wheelchairAccessible: { kind: 'boolean', label: 'Wheelchair accessible' },
    },
  },
});
