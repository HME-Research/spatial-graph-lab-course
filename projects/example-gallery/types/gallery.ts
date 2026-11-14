import { defineNodeType } from '@student-api';

/** Public exhibition space with large glazing. */
export default defineNodeType({
  id: 'gallery',
  label: 'Gallery',
  facade: { windowFraction: 0.7 },
  attributes: {
    daylight: { kind: 'enum', values: ['high', 'medium', 'low'] },
    public: { kind: 'boolean', default: true },
  },
});
