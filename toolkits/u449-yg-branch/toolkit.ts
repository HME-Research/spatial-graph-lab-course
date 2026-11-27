import { defineToolkit } from '@student-api';

// Give the toolkit a name in the app; designs are added by the student later.
export default defineToolkit({
  name: 'u449-yg-branch',
  custom: {
    nodes: {
      daylight: { kind: 'enum', values: ['high', 'medium', 'low'], label: 'Daylight' },
      central: { kind: 'boolean', label: 'Central courtyard' },
      roofed: { kind: 'boolean', label: 'Roofed' },
      welcoming: { kind: 'boolean', label: 'Welcoming entrance' },
      facesCourtyard: { kind: 'boolean', label: 'Faces courtyard' },
      floor: { kind: 'enum', values: ['ground', 'upstairs'], label: 'Floor' },
      privateBathroom: { kind: 'boolean', label: 'Private bathroom' },
    },
  },
});
