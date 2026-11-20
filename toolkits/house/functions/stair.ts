import { defineFunction } from '@student-api';

/** The stair and landing that join the storeys. */
export default defineFunction({
  id: 'stair',
  label: 'Stair / landing',
  colour: '#56606e',
  facade: { windowFraction: 0.2 },
  custom: {
    targetArea: { kind: 'number', min: 1, default: 9 },
    priority: { kind: 'number', min: 1, default: 2 },
  },
});
