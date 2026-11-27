import { defineToolkit } from '@student-api';

// Name the toolkit and label the fields shared across its rooms.
export default defineToolkit({
  name: 'u821-dc-test01',
  custom: {
    nodes: {
      zone: { kind: 'enum', values: ['public', 'private', 'service', 'circulation'], label: 'Architectural zone' },
      privacy: { kind: 'enum', values: ['shared', 'household', 'restricted'], label: 'Privacy classification' },
      floorLevel: { kind: 'number', min: 0, label: 'Planned floor level' },
      numberOfBeds: { kind: 'number', min: 0, label: 'Number of beds' },
      bathroomAccess: { kind: 'boolean', label: 'Bathroom access' },
      associatedBedroom: { kind: 'number', min: 1, label: 'Associated bedroom (room ID)' },
      seatingCapacity: { kind: 'number', min: 0, label: 'Seating capacity' },
      outdoorAccess: { kind: 'boolean', label: 'Outdoor access' },
      entranceProximity: { kind: 'enum', values: ['near', 'far'], label: 'Entrance proximity' },
      ventilation: { kind: 'enum', values: ['natural', 'mechanical', 'both'], label: 'Ventilation' },
      serviceAccess: { kind: 'boolean', label: 'Service access' },
    },
  },
});
