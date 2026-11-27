import { defineFunction } from '@student-api';

/** A courtyard: a light well inside the villa, open to the sky, giving daylight to the rooms around it. */
export default defineFunction({
  id: 'courtyard',
  label: 'Courtyard',
  colour: '#a3c96a',
  facade: { windowFraction: 0 },
  custom: {
    targetArea: { kind: 'number', min: 1, default: 9 },
    petFriendly: { kind: 'boolean', default: false },
  },
});
