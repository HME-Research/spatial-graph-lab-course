import { defineFunction } from '@student-api';

/** A guest room: single, double or family, for 1 to 4 guests. */
export default defineFunction({
  id: 'guest-room',
  label: 'Guest room',
  colour: '#4f7cc0',
  facade: { windowFraction: 0.35 },
  custom: {
    // A double room for 2 guests unless you say otherwise ("Room type from area" can set both).
    roomType: { kind: 'enum', values: ['single', 'double', 'family'], default: 'double' },
    guests: { kind: 'number', min: 1, max: 4, default: 2 },
    // 2 m² of window to the outside unless you say otherwise.
    windowArea: { kind: 'number', min: 0, default: 2 },
    hasOutsideWindow: { kind: 'boolean', default: true },
  },
});
